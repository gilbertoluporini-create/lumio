/**
 * GET /api/cron/reconcile-charges
 *
 * Crash-refund do RESUMO EDUCATIVO. Esse endpoint cobra 40-65 coins ANTES do
 * Sonnet; se a função Vercel é morta por timeout DURANTE a geração, o
 * creditCoins(refund) (que está no try/catch do handler) nunca roda → user
 * paga e fica sem resumo nem reembolso.
 *
 * Este cron varre débitos de resumo educativo ANTIGOS (já deu tempo de
 * terminar + retries) e, se a aula claramente NÃO tem o resumo salvo, devolve
 * os coins. ULTRA-CONSERVADOR (zero false-refund): só reembolsa quando a aula
 * está VIVA e a coluna summary_educational está vazia. Se o resumo existe (ou
 * a aula sumiu / metadata ambíguo) → marca reconciliado sem reembolsar.
 *
 * reconciled_at (migration 051) evita reprocessar e double-refund.
 *
 * NÃO cobre o path do wizard /api/ai/generate (close-tab) — esse cobra sem
 * gravar lecture_id no metadata; fix de raiz = salvar server-side (ver ESTADO).
 *
 * Auth: x-internal-key timing-safe vs CRON_SECRET (+ Bearer do Vercel Cron).
 */
import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/server";
import { creditCoins } from "@/lib/coins";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const EDU_REASONS = [
  "summary_educational",
  "summary_educational_cross",
  "summary_atlas",
];
const MIN_AGE_MIN = 30; // tempo pra geração + retries terminarem
const MAX_AGE_HOURS = 48; // janela de varredura
const BATCH = 50;

function safeEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

function isAuthorized(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET ?? "";
  if (!expected) return process.env.NODE_ENV !== "production";
  const internal = req.headers.get("x-internal-key") ?? "";
  if (internal && safeEq(internal, expected)) return true;
  const auth = req.headers.get("authorization") ?? "";
  return auth === `Bearer ${expected}`;
}

type TxRow = {
  id: string;
  user_id: string;
  amount: number;
  reason: string;
  metadata: { lectureId?: string; lecture_id?: string } | null;
};

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const admin = createAdminClient();
  const now = Date.now();
  const minCutoff = new Date(now - MIN_AGE_MIN * 60_000).toISOString();
  const maxCutoff = new Date(now - MAX_AGE_HOURS * 3_600_000).toISOString();

  const { data, error } = await admin
    .from("coin_transactions")
    .select("id, user_id, amount, reason, metadata")
    .in("reason", EDU_REASONS)
    .lt("amount", 0)
    .is("reconciled_at", null)
    .lt("created_at", minCutoff)
    .gt("created_at", maxCutoff)
    .order("created_at", { ascending: true })
    .limit(BATCH);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const txs = (data ?? []) as TxRow[];
  let refunded = 0;
  let confirmed = 0;
  let skipped = 0;
  let alreadyRefunded = 0;

  for (const tx of txs) {
    const lectureId = tx.metadata?.lectureId ?? tx.metadata?.lecture_id ?? null;
    const markReconciled = async () => {
      const { error: mrErr } = await admin
        .from("coin_transactions")
        .update({ reconciled_at: new Date().toISOString() })
        .eq("id", tx.id);
      if (mrErr) {
        // Carimbo falhou: o próximo run reprocessa este débito, MAS a checagem
        // alreadyRefunded() abaixo impede double-refund (enxerga o refund já
        // emitido por este run). Só logamos pra visibilidade.
        console.error("[reconcile-charges] markReconciled falhou", tx.id, mrErr);
      }
    };

    if (!lectureId) {
      // Sem id de fonte → não dá pra checar com segurança. Marca pra não
      // reprocessar (conservador: não reembolsa o que não consegue verificar).
      await markReconciled();
      skipped++;
      continue;
    }

    const { data: lecRow } = await admin
      .from("lectures")
      .select("id, summary_educational, deleted_at")
      .eq("id", lectureId)
      .maybeSingle();

    const lec = lecRow as
      | { summary_educational: unknown; deleted_at: string | null }
      | null;

    // Aula sumiu ou foi deletada → ambíguo, não reembolsa.
    if (!lec || lec.deleted_at) {
      await markReconciled();
      skipped++;
      continue;
    }

    const hasSummary =
      lec.summary_educational != null &&
      (typeof lec.summary_educational !== "object" ||
        Object.keys(lec.summary_educational as object).length > 0);

    if (hasSummary) {
      // Resumo existe → cobrança foi cumprida. Confirma.
      await markReconciled();
      confirmed++;
      continue;
    }

    // GUARD double-refund (correlação EXATA 1:1 por débito): NÃO reembolsa se
    // já existe um refund carimbado com original_tx = este débito. Cobre:
    //  (a) refund in-handler do educational-summary nas falhas normais (output
    //      curto / erro de API) — agora grava original_tx = id deste débito.
    //  (b) refund de um run ANTERIOR deste cron cujo markReconciled falhou —
    //      também grava original_tx = id deste débito.
    // educational-summary é o ÚNICO charger dos EDU_REASONS, então amarrar pelo
    // tx do débito é determinístico: zero double-refund e zero false-skip
    // (diferente de correlacionar por aula, que confunde 2 cobranças próximas
    // da mesma aula). Sem isso, todo erro do pipeline mais caro viraria
    // double-refund de 40-65 coins quando o cron roda 30min–48h depois.
    //
    // CAVEAT de transição (≤48h pós-deploy): refunds in-handler emitidos pela
    // versão ANTIGA do educational-summary não têm `original_tx`, então o guard
    // não os reconhece. NÃO é regressão (este cron é novo; antes não havia
    // proteção alguma), mas pra fechar a janela: no deploy, carimbar
    // reconciled_at nos débitos EDU criados antes do deploy (ver runbook).
    const { data: priorRefund, error: guardErr } = await admin
      .from("coin_transactions")
      .select("id")
      .eq("reason", "refund")
      .eq("metadata->>original_tx", tx.id)
      .limit(1);
    if (guardErr) {
      // Este guard é a ÚNICA proteção contra double-refund (refunds não têm
      // unique constraint no banco). Se a query falhar transitoriamente, NÃO
      // reembolsa e NÃO reconcilia → reprocessa no próximo run. Conservador:
      // erra pro lado de não vazar dinheiro.
      console.error("[reconcile-charges] guard query falhou", tx.id, guardErr);
      skipped++;
      continue;
    }
    if (priorRefund && priorRefund.length > 0) {
      // Já reembolsado pra ESTE débito → só reconcilia, não duplica.
      await markReconciled();
      alreadyRefunded++;
      continue;
    }

    // Aula viva SEM resumo educativo apesar do débito → perdido no crash.
    // Devolve os coins (amount é negativo, refund = -amount).
    try {
      await creditCoins(tx.user_id, Math.abs(tx.amount), "refund", {
        source: "reconcile_charges",
        original_tx: tx.id,
        reason: tx.reason,
        lecture_id: lectureId,
      });
      await markReconciled();
      refunded++;
    } catch (err) {
      console.error("[reconcile-charges] refund falhou", tx.id, err);
      // NÃO marca reconciled → tenta de novo no próximo run.
    }
  }

  return NextResponse.json({
    processed: txs.length,
    refunded,
    confirmed,
    skipped,
    alreadyRefunded,
  });
}
