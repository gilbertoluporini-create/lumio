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
 * Processa MAX_PER_RUN itens por execução (pra caber em 60s do Vercel Free).
 *
 * Auth: Bearer CRON_SECRET (Vercel injeta automático).
 */

import { NextResponse } from "next/server";
import { createMessage } from "@/lib/llm-fallback";
import { createAdminClient } from "@/lib/supabase/server";
import { COIN_COSTS, chargeCoins, creditCoins } from "@/lib/coins";
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
  source_document_id: string;
  title: string;
};

type DocumentRow = {
  id: string;
  user_id: string;
  title: string;
  source_text: string | null;
};

/* ----------------------------- Helpers ----------------------------- */

function buildSummarySystemPrompt(): string {
  return `Você é um tutor universitário especializado em produzir resumos didáticos em pt-BR de materiais acadêmicos.

Tarefa: ler o PDF anexado (texto extraído) e produzir um RESUMO COMPLETO e DIDÁTICO em markdown, estilo artigo. Estruturado pra um aluno entender.

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
- NÃO invente conteúdo que não está no PDF.
- Mantenha entre 600 e 1500 palavras.
- Use markdown puro (##, **, -). Sem cercas \`\`\`.`;
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
  doc: DocumentRow,
): Promise<{ ok: boolean; error?: string }> {
  if (!doc.source_text || doc.source_text.trim().length < 200) {
    return { ok: false, error: "PDF sem texto extraído suficiente." };
  }

  // 1) Cobra coins do user dono do plano (doc.user_id)
  const cost = COIN_COSTS.summary;
  const charged = await chargeCoins(doc.user_id, cost, "summary", {
    planItemId: item.id,
  });
  if (!charged.ok) {
    return {
      ok: false,
      error: `Coins insuficientes (precisa ${cost}, tem ${charged.balance}).`,
    };
  }

  // 2) Gera o resumo via Claude
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
          content: `=== PDF: ${doc.title} ===\n\n${doc.source_text.slice(0, 60_000)}\n\nGere o resumo seguindo a estrutura definida.`,
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
    await creditCoins(doc.user_id, cost, "refund", {
      planItemId: item.id,
      kind: "summary_generation_error",
    });
    return { ok: false, error: `LLM error: ${(err as Error).message}` };
  }

  if (!markdown || markdown.length < 100) {
    await creditCoins(doc.user_id, cost, "refund", {
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
      user_id: doc.user_id,
      document_id: doc.id,
      title: doc.title,
      content: summaryContent,
    })
    .select("id")
    .single();

  if (sumErr || !sumRow) {
    await creditCoins(doc.user_id, cost, "refund", {
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
      userId: doc.user_id,
      endpoint: "/api/cron/study-plan-generator",
      model: SUMMARY_MODEL,
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
      coinsCharged: cost,
    }).catch(() => {});
  }

  return { ok: true };
}

/* ----------------------------- Handler ----------------------------- */

export async function GET(request: Request) {
  // Auth Vercel Cron em prod
  const auth = request.headers.get("authorization") ?? "";
  const expected = process.env.CRON_SECRET;
  if (process.env.NODE_ENV === "production" && expected) {
    if (auth !== `Bearer ${expected}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const admin = createAdminClient();
  const summary = {
    processed: 0,
    failed: 0,
    skipped: 0,
    unsupported: 0,
  };

  for (let i = 0; i < MAX_PER_RUN; i++) {
    // 1) Pega 1 item pending com source_document_id (ordem FIFO)
    const { data: itemRaw } = await admin
      .from("study_plan_items")
      .select("id, plan_id, kind, source_document_id, title")
      .eq("status", "pending")
      .not("source_document_id", "is", null)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
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

    // 4) Lê document
    const { data: docRaw } = await admin
      .from("documents")
      .select("id, user_id, title, source_text")
      .eq("id", item.source_document_id)
      .maybeSingle();
    if (!docRaw) {
      await admin
        .from("study_plan_items")
        .update({
          status: "failed",
          error_message: "Documento de origem não encontrado.",
        })
        .eq("id", item.id);
      summary.failed++;
      continue;
    }
    const doc = docRaw as DocumentRow;

    // 5) Processa
    const result = await processSummaryItem(admin, item, doc);
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

  return NextResponse.json(summary);
}
