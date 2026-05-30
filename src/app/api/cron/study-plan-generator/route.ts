/**
 * GET /api/cron/study-plan-generator
 *
 * Vercel Cron a cada 1 min. Pega itens em status='pending' de planos de
 * estudo criados pelo wizard, gera o asset correspondente, vincula em
 * asset_id e marca status='done'.
 *
 * Atualmente só `summary` é suportado — outros kinds (flashcards/quiz/
 * mindmap) caem em status='failed' até serem implementados nas próximas
 * sub-tarefas.
 *
 * Contexto cruzado: antes de gerar o resumo, o worker carrega até 3 docs
 * e 3 lectures da MESMA matéria do plano (excluindo a própria fonte) e
 * injeta no prompt como MATERIAL COMPLEMENTAR. O LLM usa só pra consistência
 * de termos e conceitos — não copia, não inventa fatos.
 *
 * Processa MAX_PER_RUN itens por execução (pra caber em 60s do Vercel Free).
 *
 * Auth: Bearer CRON_SECRET (Vercel injeta automático).
 */

import { NextResponse } from "next/server";
import { createMessage } from "@/lib/llm-fallback";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { chargeCoins, creditCoins } from "@/lib/coins";
import { calculateSummaryCoins } from "@/lib/coin-costs";
import { getClientIp, limitOrThrow } from "@/lib/rate-limit";
import { logAiUsage } from "@/lib/ai-usage";
import type { LectureSummary } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_PER_RUN = 3;
const SUMMARY_MODEL = "claude-sonnet-4-5-20250929";

type PlanItemRow = {
  id: string;
  plan_id: string;
  kind: string;
  source_document_id: string | null;
  source_lecture_id: string | null;
  title: string;
};

/** Fonte normalizada: vem de document (PDF) ou lecture (transcript). */
type ItemSource = {
  userId: string;
  title: string;
  text: string;
};

/* ----------------------------- Helpers ----------------------------- */

function buildSummarySystemPrompt(): string {
  return `Você é um tutor universitário especializado em produzir resumos didáticos em pt-BR de materiais acadêmicos.

Tarefa: ler a FONTE PRINCIPAL anexada e produzir um RESUMO COMPLETO e DIDÁTICO em markdown, estilo artigo. Estruturado pra um aluno entender.

ESTRUTURA OBRIGATÓRIA:
# {Título do tema central da aula}

## Visão geral
Um parágrafo de 4-6 linhas apresentando o tema.

## {Seção 1 — nome descritivo}
Texto corrido explicando o conceito desse bloco.

## {Seção 2 — nome descritivo}
...

## Pontos-chave
- Lista de 5-8 bullets com fatos essenciais (1 frase cada).

## Aplicação clínica/prática
Se for assunto médico, conexão com prática clínica. Senão, exemplos práticos.

REGRAS:
- pt-BR formal-acessível. Terminologia técnica preservada com explicação.
- O resumo é da FONTE PRINCIPAL. Quando houver MATERIAL COMPLEMENTAR DA MESMA
  MATÉRIA, use-o apenas pra (1) reforçar definições com termos consistentes,
  (2) cruzar conceitos correlatos pra dar profundidade, (3) usar exemplos do
  mesmo universo quando ajudarem. NÃO invente fatos do complementar como se
  fossem da fonte principal. Se a fonte principal não menciona um detalhe,
  ele não entra no resumo dela.
- Mantenha entre 600 e 1500 palavras.
- Use markdown puro (##, **, -). Sem cercas \`\`\`.`;
}

/**
 * Busca outros materiais (docs + lectures) da MESMA matéria do plano,
 * excluindo a fonte atual, pra enriquecer o prompt com contexto cruzado.
 *
 * Limites pra controlar custo de tokens:
 *   - até MAX_EXTRA_ITEMS itens (3 docs + 3 lectures)
 *   - até MAX_CHARS_PER_EXTRA chars por item (~1k tokens)
 *   - até MAX_TOTAL_EXTRA chars no total (~3k tokens extras)
 *
 * Se subject_id do plano for null ou não houver material complementar
 * relevante, retorna string vazia (worker segue sem contexto extra).
 */
async function loadComplementaryContext(
  admin: ReturnType<typeof createAdminClient>,
  planId: string,
  userId: string,
  excludeDocId: string | null,
  excludeLectureId: string | null,
): Promise<string> {
  const MAX_EXTRA_ITEMS = 3;
  const MAX_CHARS_PER_EXTRA = 4000;
  const MAX_TOTAL_EXTRA = 12_000;

  const { data: planRaw } = await admin
    .from("study_plans")
    .select("subject_id")
    .eq("id", planId)
    .maybeSingle();
  const planSubjectId =
    (planRaw as { subject_id: string | null } | null)?.subject_id ?? null;
  if (!planSubjectId) return "";

  let docsQ = admin
    .from("documents")
    .select("id, title, source_text")
    .eq("user_id", userId)
    .eq("subject_id", planSubjectId)
    .not("source_text", "is", null)
    .order("created_at", { ascending: false })
    .limit(MAX_EXTRA_ITEMS + 1);
  if (excludeDocId) docsQ = docsQ.neq("id", excludeDocId);

  let lecsQ = admin
    .from("lectures")
    .select("id, title, transcript")
    .eq("user_id", userId)
    .eq("subject_id", planSubjectId)
    .not("transcript", "is", null)
    .order("created_at", { ascending: false })
    .limit(MAX_EXTRA_ITEMS + 1);
  if (excludeLectureId) lecsQ = lecsQ.neq("id", excludeLectureId);

  const [{ data: docs }, { data: lecs }] = await Promise.all([docsQ, lecsQ]);

  const parts: string[] = [];
  let totalChars = 0;
  const pushIfFits = (label: string, title: string, text: string) => {
    if (parts.length >= MAX_EXTRA_ITEMS * 2) return;
    if (!text || text.trim().length < 200) return;
    const slice = text.slice(0, MAX_CHARS_PER_EXTRA);
    if (totalChars + slice.length > MAX_TOTAL_EXTRA) return;
    parts.push(`### ${label}: ${title}\n${slice}`);
    totalChars += slice.length;
  };

  // Intercala docs e lectures (3+3 max) pra equilibrar contexto.
  const docList = ((docs ?? []) as Array<{ title: string; source_text: string }>);
  const lecList = ((lecs ?? []) as Array<{ title: string; transcript: string }>);
  const maxRound = Math.max(docList.length, lecList.length);
  for (let i = 0; i < maxRound; i++) {
    if (docList[i]) pushIfFits("PDF", docList[i].title, docList[i].source_text);
    if (lecList[i]) pushIfFits("Aula", lecList[i].title, lecList[i].transcript);
  }

  return parts.join("\n\n");
}

function extractHighlights(markdown: string, max: number): string[] {
  const out: string[] = [];
  const lines = markdown.split("\n");
  let inSection = false;
  for (const line of lines) {
    if (/^##\s+pontos[- ]chave/i.test(line.trim())) {
      inSection = true;
      continue;
    }
    if (inSection) {
      if (/^##\s/.test(line)) break;
      const m = line.match(/^\s*-\s+(.+)/);
      if (m) {
        out.push(m[1].slice(0, 120));
        if (out.length >= max) break;
      }
    }
  }
  return out;
}

/* ----------------------------- Worker ----------------------------- */

async function processSummaryItem(
  admin: ReturnType<typeof createAdminClient>,
  item: PlanItemRow,
  source: ItemSource,
  complementaryContext: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!source.text || source.text.trim().length < 200) {
    return {
      ok: false,
      error: item.source_document_id
        ? "PDF sem texto extraído suficiente."
        : "Aula sem transcrição suficiente.",
    };
  }

  // 1) Cobra coins do user dono do plano — preço linear no tamanho da fonte.
  //    Fonte com <200 chars já foi barrada no guard acima.
  const cost = calculateSummaryCoins(source.text.length);
  const charged = await chargeCoins(source.userId, cost, "summary", {
    planItemId: item.id,
  });
  if (!charged.ok) {
    return {
      ok: false,
      error: `Coins insuficientes (precisa ${cost}, tem ${charged.balance}).`,
    };
  }

  // 2) Gera o resumo via Claude
  const sourceLabel = item.source_document_id ? "PDF" : "AULA";
  const mainBlock = `=== FONTE PRINCIPAL (${sourceLabel}): ${source.title} ===\n\n${source.text.slice(0, 60_000)}`;
  const complementBlock = complementaryContext
    ? `\n\n=== MATERIAL COMPLEMENTAR DA MESMA MATÉRIA ===\nUse apenas como contexto cruzado pra reforçar definições e cruzar conceitos. Não copie. Não invente fatos do complementar como se fossem da fonte principal.\n\n${complementaryContext}`
    : "";
  const userContent = `${mainBlock}${complementBlock}\n\nGere o resumo da FONTE PRINCIPAL seguindo a estrutura definida.`;

  let markdown = "";
  let usage: { input_tokens: number; output_tokens: number } | undefined;
  try {
    const resp = await createMessage({
      model: SUMMARY_MODEL,
      max_tokens: 4000,
      system: buildSummarySystemPrompt(),
      messages: [
        {
          role: "user",
          content: userContent,
        },
      ],
    });
    const block = resp.content.find((b) => b.type === "text");
    markdown = block && block.type === "text" ? block.text.trim() : "";
    if (resp.usage) {
      usage = {
        input_tokens: resp.usage.input_tokens,
        output_tokens: resp.usage.output_tokens,
      };
    }
  } catch (err) {
    await creditCoins(source.userId, cost, "refund", {
      planItemId: item.id,
      kind: "summary_generation_error",
    });
    return { ok: false, error: `LLM error: ${(err as Error).message}` };
  }

  if (!markdown || markdown.length < 100) {
    await creditCoins(source.userId, cost, "refund", {
      planItemId: item.id,
      kind: "summary_empty",
    });
    return { ok: false, error: "Resumo gerado veio vazio." };
  }

  // 3) Salva summary
  const summaryContent: LectureSummary = {
    generatedAt: new Date().toISOString(),
    generalSummary: markdown,
    highlights: extractHighlights(markdown, 6),
    sections: [],
  };

  const { data: sumRow, error: sumErr } = await admin
    .from("summaries")
    .insert({
      user_id: source.userId,
      document_id: item.source_document_id,
      lecture_id: item.source_lecture_id,
      title: source.title,
      content: summaryContent,
    })
    .select("id")
    .single();

  if (sumErr || !sumRow) {
    await creditCoins(source.userId, cost, "refund", {
      planItemId: item.id,
      kind: "summary_save_failed",
    });
    return { ok: false, error: `Save failed: ${sumErr?.message}` };
  }

  const summaryId = (sumRow as { id: string }).id;

  // 4) Vincula no item + marca done
  await admin
    .from("study_plan_items")
    .update({
      asset_id: summaryId,
      status: "done",
      error_message: null,
    })
    .eq("id", item.id);

  // 5) Log de uso (best-effort)
  if (usage) {
    void logAiUsage({
      userId: source.userId,
      endpoint: "/api/cron/study-plan-generator",
      model: SUMMARY_MODEL,
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
      coinsCharged: cost,
    }).catch(() => {});
  }

  return { ok: true };
}

/* ----------------------------- Worker core ----------------------------- */

/**
 * Loop principal — pega até MAX_PER_RUN items pending e processa.
 * Se restrictPlanIds for passado, filtra items SÓ daqueles planos (modo
 * client-triggered: user logado processa só os planos dele).
 * Sem restrictPlanIds: processa qualquer item (modo Vercel Cron / admin).
 */
async function runWorker(restrictPlanIds: string[] | null) {
  const admin = createAdminClient();
  const summary = {
    processed: 0,
    failed: 0,
    skipped: 0,
    unsupported: 0,
  };

  for (let i = 0; i < MAX_PER_RUN; i++) {
    // 1) Pega 1 item pending com source (document OU lecture), ordem FIFO.
    let q = admin
      .from("study_plan_items")
      .select("id, plan_id, kind, source_document_id, source_lecture_id, title")
      .eq("status", "pending")
      .or("source_document_id.not.is.null,source_lecture_id.not.is.null")
      .order("created_at", { ascending: true })
      .limit(1);
    if (restrictPlanIds && restrictPlanIds.length > 0) {
      q = q.in("plan_id", restrictPlanIds);
    }
    const { data: itemRaw } = await q.maybeSingle();
    if (!itemRaw) break;
    const item = itemRaw as PlanItemRow;

    // 2) Lock atômico: vira generating só se ainda for pending
    const { data: lockRows, error: lockErr } = await admin
      .from("study_plan_items")
      .update({ status: "generating" })
      .eq("id", item.id)
      .eq("status", "pending")
      .select("id");
    if (lockErr || !lockRows || lockRows.length === 0) {
      summary.skipped++;
      continue;
    }

    // 3) Kinds não-summary: marca como failed temporário
    if (item.kind !== "summary") {
      await admin
        .from("study_plan_items")
        .update({
          status: "failed",
          error_message: `Tipo "${item.kind}" ainda não suportado pelo worker.`,
        })
        .eq("id", item.id);
      summary.unsupported++;
      continue;
    }

    // 4) Lê source — document OU lecture, dependendo de qual FK está preenchida
    let source: ItemSource | null = null;
    if (item.source_document_id) {
      const { data: docRaw } = await admin
        .from("documents")
        .select("user_id, title, source_text")
        .eq("id", item.source_document_id)
        .maybeSingle();
      if (docRaw) {
        const d = docRaw as {
          user_id: string;
          title: string;
          source_text: string | null;
        };
        source = {
          userId: d.user_id,
          title: d.title,
          text: d.source_text ?? "",
        };
      }
    } else if (item.source_lecture_id) {
      const { data: lecRaw } = await admin
        .from("lectures")
        .select("user_id, title, transcript")
        .eq("id", item.source_lecture_id)
        .maybeSingle();
      if (lecRaw) {
        const l = lecRaw as {
          user_id: string;
          title: string;
          transcript: string | null;
        };
        source = {
          userId: l.user_id,
          title: l.title,
          text: l.transcript ?? "",
        };
      }
    }

    if (!source) {
      await admin
        .from("study_plan_items")
        .update({
          status: "failed",
          error_message: "Fonte de origem não encontrada.",
        })
        .eq("id", item.id);
      summary.failed++;
      continue;
    }

    // 5) Contexto complementar: outros materiais da mesma matéria do plano
    //    (não bloqueia se falhar — geração segue só com a fonte principal).
    let complementaryContext = "";
    try {
      complementaryContext = await loadComplementaryContext(
        admin,
        item.plan_id,
        source.userId,
        item.source_document_id,
        item.source_lecture_id,
      );
    } catch (err) {
      console.warn("[plan-worker] complementary context failed", err);
    }

    // 6) Processa
    const result = await processSummaryItem(
      admin,
      item,
      source,
      complementaryContext,
    );
    if (result.ok) {
      summary.processed++;
    } else {
      await admin
        .from("study_plan_items")
        .update({
          status: "failed",
          error_message: result.error?.slice(0, 500) ?? "Erro desconhecido.",
        })
        .eq("id", item.id);
      summary.failed++;
    }
  }

  return summary;
}

/* ----------------------------- Handlers ----------------------------- */

/**
 * GET — Vercel Cron path. Auth via Bearer CRON_SECRET. Processa qualquer item.
 * (Atualmente sem schedule no vercel.json porque plano Hobby não suporta
 * cron sub-diário — mantemos o handler funcional pra upgrade futuro.)
 */
export async function GET(request: Request) {
  const auth = request.headers.get("authorization") ?? "";
  const expected = process.env.CRON_SECRET;
  if (process.env.NODE_ENV === "production" && expected) {
    if (auth !== `Bearer ${expected}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }
  const result = await runWorker(null);
  return NextResponse.json(result);
}

/**
 * POST — endpoint chamado pelo CLIENTE (/planos/[id]) enquanto há items
 * pending. Auth via sessão Supabase. Processa SÓ planos do user logado.
 * Substitui o cron Vercel enquanto a conta for Hobby.
 */
export async function POST(request: Request) {
  const ip = getClientIp(request);
  const limited = limitOrThrow(`sp-worker:ip:${ip}`, 10, 60_000);
  if (limited) return limited;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Faça login." }, { status: 401 });
  }

  const userLimit = limitOrThrow(`sp-worker:user:${user.id}`, 12, 60_000);
  if (userLimit) return userLimit;

  // Lista planos do user — passamos os IDs pro worker filtrar
  const admin = createAdminClient();
  const { data: plansRaw } = await admin
    .from("study_plans")
    .select("id")
    .eq("user_id", user.id);
  const planIds = ((plansRaw ?? []) as Array<{ id: string }>).map((p) => p.id);

  if (planIds.length === 0) {
    return NextResponse.json({ processed: 0, failed: 0, skipped: 0, unsupported: 0 });
  }

  const result = await runWorker(planIds);
  return NextResponse.json(result);
}
