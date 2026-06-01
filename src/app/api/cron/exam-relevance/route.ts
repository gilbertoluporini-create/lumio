/**
 * GET /api/cron/exam-relevance
 *
 * Smart Prep de Prova: pré-calcula relevância dos assets do user (aulas,
 * documentos, resumos) pras provas próximas (<=7 dias). UI consome via
 * /api/exam-relevance (badge "cai na prova" nos feeds).
 *
 * Fluxo:
 *   1. Lê todos `study_plans` ativos com exam_date entre hoje e hoje+7d.
 *   2. Pra cada plano, monta uma query semântica = `${title}\n${subject_name}`
 *      e embedda 1 vez.
 *   3. Roda 3 chamadas à RPC `search_content_embeddings` (1 por source_kind:
 *      lecture / document / summary), escopadas por user_id e — se o plano
 *      tem subject_id — também por subject_id. Retorna top-K (10) chunks
 *      acima do threshold. Agrego por source_id pegando o maior similarity.
 *   4. DELETE prévio das rows do plano em `exam_lecture_relevance` (refresh
 *      total — sem incremental ainda) e INSERT em lote dos novos rows.
 *
 * Por que usar search_content_embeddings (RPC pgvector) em vez de embedar
 * transcripts inteiros aqui?
 *   - O custo já foi pago: a indexação acontece on-write em
 *     /api/embed / indexContent. A RPC só usa o que já tá no banco.
 *   - 1 embed por plano (~20 tokens, $0.000_000_4) × ~5 planos × ~30 users
 *     ≈ 150 embeds/dia → $0.000_06/dia. Praticamente zero.
 *   - Antes a estimativa era 7500 embeds/dia ($0.015) re-embedando assets;
 *     ficou ~250× mais barato delegando pro RPC já existente.
 *
 * Auth: Bearer CRON_SECRET (Vercel injeta automático) OU header x-internal-key
 * equivalente (mantém compat com chamadas manuais via curl).
 *
 * Schedule em vercel.json: "0 3 * * *" (3h UTC = 0h BRT).
 */

import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/server";
import {
  generateEmbedding,
  type ChunkRow,
  type SourceKind,
} from "@/lib/embeddings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Janela de provas processada: hoje a hoje+7d. */
const HORIZON_DAYS = 7;
/** Threshold cosine pra um asset ser considerado "relevante". */
const RELEVANCE_THRESHOLD = 0.5;
/** Top-K assets por plano por source_kind. */
const TOP_K = 10;

type StudyPlanRow = {
  id: string;
  user_id: string;
  subject_id: string | null;
  title: string;
  exam_date: string;
};

type SubjectRow = { id: string; name: string };

function safeEq(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

function isAuthorized(req: Request): boolean {
  const expected = process.env.CRON_SECRET ?? "";
  if (!expected) {
    // Sem CRON_SECRET (dev local) → permite. Em prod o secret deve existir.
    return process.env.NODE_ENV !== "production";
  }
  const bearer = req.headers.get("authorization") ?? "";
  if (bearer.startsWith("Bearer ")) {
    const candidate = bearer.slice("Bearer ".length);
    if (safeEq(candidate, expected)) return true;
  }
  const internal = req.headers.get("x-internal-key") ?? "";
  if (internal && safeEq(internal, expected)) return true;
  // Vercel adiciona x-vercel-cron quando o cron dispara — usado como
  // sinal complementar mas SEMPRE acompanhado do Bearer secret acima.
  return false;
}

function todayUtcDateStr(): string {
  const d = new Date();
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  )
    .toISOString()
    .slice(0, 10);
}

function horizonUtcDateStr(daysAhead: number): string {
  const d = new Date();
  const ms = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) +
    daysAhead * 24 * 60 * 60 * 1000;
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Agrega top-K assets distintos (por source_id) a partir dos chunks.
 * Mantém o maior `similarity` por asset.
 */
function aggregateBySource(chunks: ChunkRow[], k: number): Map<string, number> {
  const best = new Map<string, number>();
  for (const c of chunks) {
    const prev = best.get(c.source_id) ?? 0;
    if (c.similarity > prev) best.set(c.source_id, c.similarity);
  }
  // Top-K por score desc
  const sorted = Array.from(best.entries()).sort((a, b) => b[1] - a[1]);
  return new Map(sorted.slice(0, k));
}

type RelevanceInsert = {
  user_id: string;
  exam_id: string;
  lecture_id?: string | null;
  document_id?: string | null;
  summary_id?: string | null;
  relevance_score: number;
};

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY ausente — sem como gerar embeddings." },
      { status: 503 },
    );
  }

  const admin = createAdminClient();
  const today = todayUtcDateStr();
  const horizon = horizonUtcDateStr(HORIZON_DAYS);

  // 1. Provas ativas em <=7d
  const { data: planRows, error: planErr } = await admin
    .from("study_plans")
    .select("id, user_id, subject_id, title, exam_date")
    .eq("status", "active")
    .gte("exam_date", today)
    .lte("exam_date", horizon);

  if (planErr) {
    console.error("[cron/exam-relevance] study_plans select failed", planErr);
    return NextResponse.json(
      { error: "study_plans query failed" },
      { status: 500 },
    );
  }
  const plans = (planRows ?? []) as StudyPlanRow[];

  if (plans.length === 0) {
    return NextResponse.json({
      ok: true,
      processed_plans: 0,
      total_relevance_rows: 0,
      window: { from: today, to: horizon },
    });
  }

  // 2. Cache subjects pra enriquecer query semântica
  const subjectIds = Array.from(
    new Set(plans.map((p) => p.subject_id).filter((s): s is string => !!s)),
  );
  const subjectsById = new Map<string, SubjectRow>();
  if (subjectIds.length > 0) {
    const { data: subjRows } = await admin
      .from("subjects")
      .select("id, name")
      .in("id", subjectIds);
    for (const s of (subjRows ?? []) as SubjectRow[]) {
      subjectsById.set(s.id, s);
    }
  }

  let totalInserted = 0;
  const perPlanStats: Array<{
    plan_id: string;
    user_id: string;
    inserted: number;
    skipped_reason?: string;
  }> = [];

  for (const plan of plans) {
    const subjName = plan.subject_id
      ? subjectsById.get(plan.subject_id)?.name ?? ""
      : "";
    const query = `${plan.title}\n${subjName}`.trim();
    if (query.length === 0) {
      perPlanStats.push({
        plan_id: plan.id,
        user_id: plan.user_id,
        inserted: 0,
        skipped_reason: "empty_query",
      });
      continue;
    }

    // 3. Embedda query 1×
    let queryEmbedding: number[];
    try {
      const { embedding } = await generateEmbedding(query, openaiKey);
      queryEmbedding = embedding;
    } catch (err) {
      console.error(
        `[cron/exam-relevance] embed failed plan=${plan.id}`,
        (err as Error).message,
      );
      perPlanStats.push({
        plan_id: plan.id,
        user_id: plan.user_id,
        inserted: 0,
        skipped_reason: "embed_failed",
      });
      continue;
    }

    // 4. Busca top-K em cada source_kind
    const SOURCE_KINDS: SourceKind[] = ["lecture", "document", "summary"];
    const insertRows: RelevanceInsert[] = [];

    for (const kind of SOURCE_KINDS) {
      const { data: chunkData, error: rpcErr } = await admin.rpc(
        "search_content_embeddings",
        {
          query_embedding: queryEmbedding,
          user_id_input: plan.user_id,
          subject_id_input: plan.subject_id ?? null,
          source_kind_input: kind,
          match_threshold: RELEVANCE_THRESHOLD,
          // pedimos mais chunks pra ter chance de cobrir múltiplos assets
          // antes do aggregate por source_id.
          match_count: TOP_K * 5,
        },
      );
      if (rpcErr) {
        console.warn(
          `[cron/exam-relevance] rpc failed plan=${plan.id} kind=${kind}`,
          rpcErr,
        );
        continue;
      }
      const chunks = (chunkData ?? []) as ChunkRow[];
      const top = aggregateBySource(chunks, TOP_K);

      for (const [sourceId, score] of top.entries()) {
        const base: RelevanceInsert = {
          user_id: plan.user_id,
          exam_id: plan.id,
          lecture_id: null,
          document_id: null,
          summary_id: null,
          relevance_score: Number(score.toFixed(4)),
        };
        if (kind === "lecture") base.lecture_id = sourceId;
        else if (kind === "document") base.document_id = sourceId;
        else if (kind === "summary") base.summary_id = sourceId;
        insertRows.push(base);
      }
    }

    // 5. DELETE prévio + INSERT (refresh total — sem incremental hoje).
    //    Faz num único loop transacional não-formal: se o INSERT falhar,
    //    o DELETE já rodou → próximo cron repõe. Aceitável: a UI cai pra
    //    "sem badge" temporariamente, não corrompe nada.
    const { error: delErr } = await admin
      .from("exam_lecture_relevance")
      .delete()
      .eq("exam_id", plan.id);
    if (delErr) {
      console.warn(
        `[cron/exam-relevance] delete prev failed plan=${plan.id}`,
        delErr,
      );
    }

    if (insertRows.length > 0) {
      const { error: insErr } = await admin
        .from("exam_lecture_relevance")
        .insert(insertRows);
      if (insErr) {
        console.warn(
          `[cron/exam-relevance] insert failed plan=${plan.id}`,
          insErr,
        );
        perPlanStats.push({
          plan_id: plan.id,
          user_id: plan.user_id,
          inserted: 0,
          skipped_reason: "insert_failed",
        });
        continue;
      }
    }

    totalInserted += insertRows.length;
    perPlanStats.push({
      plan_id: plan.id,
      user_id: plan.user_id,
      inserted: insertRows.length,
    });
  }

  return NextResponse.json({
    ok: true,
    processed_plans: plans.length,
    total_relevance_rows: totalInserted,
    window: { from: today, to: horizon },
    per_plan: perPlanStats,
  });
}
