/**
 * GET /api/cron/study-plan-generator
 *
 * Vercel Cron a cada 1 min. Pega itens em status='pending' de planos de
 * estudo criados pelo wizard, gera o asset correspondente, vincula em
 * asset_id e marca status='done'.
 *
 * Suporta os 4 kinds principais:
 *   - summary    → tabela `summaries`, custo dinâmico (calculateSummaryCoins)
 *   - flashcards → tabela `lecture_assets`, custo fixo COIN_COSTS.flashcards
 *   - quiz       → tabela `lecture_assets`, custo fixo COIN_COSTS.quiz
 *   - mindmap    → tabela `lecture_assets`, custo fixo COIN_COSTS.mindmap
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
import { calculateSummaryCoins, COIN_COSTS } from "@/lib/coin-costs";
import { getClientIp, limitOrThrow } from "@/lib/rate-limit";
import { logAiUsage } from "@/lib/ai-usage";
import type { LectureSummary } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Sonnet 4.5 com source combinada (PDF + transcript de aula) leva 50-80s
// só no LLM call. Worker processa até MAX_PER_RUN items, então 240s cobre
// 3 × ~70s com margem. Antes era 60s — função era killed no meio da
// chamada e o item ficava stuck em 'generating' pra sempre.
export const maxDuration = 240;

const MAX_PER_RUN = 3;
const SUMMARY_MODEL = "claude-sonnet-4-5-20250929";

/** Items em `generating` há mais que esse threshold viram `pending` de
 *  novo no início de cada exec — significa que o worker anterior morreu
 *  sem completar (timeout Vercel, crash, network). 5 min cobre maxDuration
 *  (4 min) + 1 min de margem antes de considerar stuck. */
const STUCK_RECOVERY_MS = 5 * 60 * 1000;

type PlanItemRow = {
  id: string;
  plan_id: string;
  kind: string;
  source_document_id: string | null;
  source_lecture_id: string | null;
  source_document_ids: string[] | null;
  source_lecture_ids: string[] | null;
  title: string;
};

/** Fonte normalizada: combina N PDFs e N aulas num único texto concatenado.
 *  Quando o user agrupa "aula gravada + slides do prof" num tópico, ambas
 *  alimentam o mesmo asset com seções separadas pra preservar contexto. */
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
  excludeDocIds: string[],
  excludeLectureIds: string[],
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
  if (excludeDocIds.length > 0) {
    // .not("id", "in", ...) usa sintaxe especial do PostgREST
    docsQ = docsQ.not("id", "in", `(${excludeDocIds.join(",")})`);
  }

  let lecsQ = admin
    .from("lectures")
    .select("id, title, transcript")
    .eq("user_id", userId)
    .eq("subject_id", planSubjectId)
    .not("transcript", "is", null)
    .order("created_at", { ascending: false })
    .limit(MAX_EXTRA_ITEMS + 1);
  if (excludeLectureIds.length > 0) {
    lecsQ = lecsQ.not("id", "in", `(${excludeLectureIds.join(",")})`);
  }

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

/* ----------------------------- JSON asset handlers ----------------------------- */

/**
 * Config genérica pra geração de assets JSON (flashcards/quiz/mindmap).
 * Cada kind tem prompt próprio + parser próprio, mas o fluxo é igual:
 * cobra → LLM → parse → salva em lecture_assets → vincula item.
 */
type JsonAssetConfig = {
  kind: "flashcards" | "quiz" | "mindmap";
  cost: number;
  systemPrompt: string;
  /** Parse + valida JSON. Retorna null se inválido. */
  parsePayload: (rawText: string) => Record<string, unknown> | null;
  /** Nome no logAiUsage. */
  endpointLabel: string;
};

const ASSET_MODEL = "claude-sonnet-4-5-20250929";

function stripJsonWrappers(text: string): string {
  return text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
}

function tryParseJsonObject(text: string): Record<string, unknown> | null {
  const cleaned = stripJsonWrappers(text);
  try {
    const parsed = JSON.parse(cleaned);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {}
  const m = cleaned.match(/\{[\s\S]*\}/);
  if (m) {
    try {
      const parsed = JSON.parse(m[0]);
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch {}
  }
  return null;
}

/* ---------- Prompts (espelham os endpoints /api/{kind}) ---------- */

const FLASHCARDS_SYSTEM = `Você é um gerador de FLASH CARDS de revisão pra estudantes universitários brasileiros.

Recebe a FONTE PRINCIPAL (PDF extraído OU transcrição de aula) e, opcionalmente, MATERIAL COMPLEMENTAR de outros estudos da mesma matéria.

Sua tarefa: gerar flash cards pergunta-resposta otimizados pra revisão ativa.

REGRAS:
- Responda APENAS com JSON válido. Sem markdown wrappers.
- Crie 10 flash cards (a menos que o conteúdo seja insuficiente).
- Cada card foca em UM conceito-chave, fato importante ou definição da FONTE PRINCIPAL.
- Pergunta direta (1 frase), resposta concisa (1-3 frases).
- Inclua "hint" opcional (uma pista curta) e "difficulty" (easy/medium/hard).
- Variedade: conceitos, definições, comparações, fatos numéricos, aplicações práticas.
- Use o MATERIAL COMPLEMENTAR só pra dar consistência de termos. Não invente fatos.
- Em português brasileiro.

FORMATO:
{
  "cards": [
    { "question": "<...>", "answer": "<...>", "hint": "<...>", "difficulty": "easy|medium|hard" }
  ]
}`;

const QUIZ_SYSTEM = `Você gera QUIZZES de revisão pra estudantes universitários brasileiros.

Recebe a FONTE PRINCIPAL (PDF extraído OU transcrição de aula) e, opcionalmente, MATERIAL COMPLEMENTAR.

Gere questões de múltipla escolha com EXATAMENTE 4 opções cada, onde APENAS 1 está correta.

REGRAS:
- Responda APENAS com JSON válido. Sem markdown wrappers.
- Crie 8 questões.
- Cada questão testa UM conceito-chave da FONTE PRINCIPAL.
- 4 opções (A, B, C, D) — uma certa, três plausíveis mas erradas.
- correctIndex: 0..3.
- explanation: 1-2 frases explicando por que a resposta correta é correta.
- Variedade: fatos, conceitos, comparações, aplicações.
- Use o MATERIAL COMPLEMENTAR só pra consistência. Não invente fatos.
- Em português brasileiro.

FORMATO:
{
  "questions": [
    { "question": "<...>", "options": ["A","B","C","D"], "correctIndex": 0, "explanation": "<...>" }
  ]
}`;

const MINDMAP_SYSTEM = `Você gera MAPAS MENTAIS de aulas universitárias em português brasileiro.

Recebe a FONTE PRINCIPAL (PDF extraído OU transcrição de aula) e, opcionalmente, MATERIAL COMPLEMENTAR.

Sua tarefa: extrair a estrutura hierárquica da FONTE PRINCIPAL em forma de mapa mental.

REGRAS:
- Responda APENAS com JSON válido. Sem markdown wrappers.
- centralTopic: 1 frase curta resumindo o tema central.
- branches: 3-6 ramos principais (grandes conceitos/seções).
- Cada branch pode ter 2-5 children (sub-tópicos).
- Sub-tópicos podem ter mais children (max 3 níveis de profundidade total).
- label: nome curto (1-4 palavras).
- detail (opcional): 1 frase de contexto se útil.
- Use o MATERIAL COMPLEMENTAR só pra consistência de termos. Não invente fatos.

FORMATO:
{
  "centralTopic": "<tema>",
  "branches": [
    { "label": "<ramo>", "detail": "<opc>", "children": [{ "label": "<sub>", "children": [...] }] }
  ]
}`;

/** Mensagem user padrão pros 3 kinds JSON: FONTE PRINCIPAL + MATERIAL COMPLEMENTAR. */
function buildJsonUserMessage(
  source: ItemSource,
  complementaryContext: string,
  sourceLabel: "PDF" | "AULA",
): string {
  const main = `=== FONTE PRINCIPAL (${sourceLabel}): ${source.title} ===\n\n${source.text.slice(0, 60_000)}`;
  const comp = complementaryContext
    ? `\n\n=== MATERIAL COMPLEMENTAR DA MESMA MATÉRIA ===\nUse só pra consistência de termos. Não invente fatos.\n\n${complementaryContext}`
    : "";
  return `${main}${comp}\n\nGere o asset seguindo o formato JSON definido.`;
}

const FLASHCARDS_CONFIG: JsonAssetConfig = {
  kind: "flashcards",
  cost: COIN_COSTS.flashcards,
  systemPrompt: FLASHCARDS_SYSTEM,
  parsePayload: (raw) => {
    const obj = tryParseJsonObject(raw);
    if (!obj || !Array.isArray(obj.cards) || obj.cards.length === 0) return null;
    return obj;
  },
  endpointLabel: "study-plan-flashcards",
};

const QUIZ_CONFIG: JsonAssetConfig = {
  kind: "quiz",
  cost: COIN_COSTS.quiz,
  systemPrompt: QUIZ_SYSTEM,
  parsePayload: (raw) => {
    const obj = tryParseJsonObject(raw);
    if (!obj || !Array.isArray(obj.questions) || obj.questions.length === 0) return null;
    return obj;
  },
  endpointLabel: "study-plan-quiz",
};

const MINDMAP_CONFIG: JsonAssetConfig = {
  kind: "mindmap",
  cost: COIN_COSTS.mindmap,
  systemPrompt: MINDMAP_SYSTEM,
  parsePayload: (raw) => {
    const obj = tryParseJsonObject(raw);
    if (!obj || typeof obj.centralTopic !== "string" || !Array.isArray(obj.branches)) return null;
    return obj;
  },
  endpointLabel: "study-plan-mindmap",
};

/**
 * Handler genérico pros 3 kinds JSON. Mesma sequência do summary:
 * cobra → LLM → parse → salva em lecture_assets vinculado ao
 * source_document_id OU source_lecture_id do item → atualiza item.asset_id.
 *
 * Refund automático em qualquer falha após a cobrança.
 */
async function processJsonAssetItem(
  admin: ReturnType<typeof createAdminClient>,
  item: PlanItemRow,
  source: ItemSource,
  complementaryContext: string,
  config: JsonAssetConfig,
): Promise<{ ok: boolean; error?: string }> {
  if (!source.text || source.text.trim().length < 200) {
    return {
      ok: false,
      error: item.source_document_id
        ? "PDF sem texto extraído suficiente."
        : "Aula sem transcrição suficiente.",
    };
  }

  const charged = await chargeCoins(source.userId, config.cost, config.kind, {
    planItemId: item.id,
  });
  if (!charged.ok) {
    return {
      ok: false,
      error: `Coins insuficientes (precisa ${config.cost}, tem ${charged.balance}).`,
    };
  }

  const refund = async (reason: string) => {
    await creditCoins(source.userId, config.cost, "refund", {
      planItemId: item.id,
      kind: `${config.kind}_${reason}`,
    });
  };

  const sourceLabel = item.source_document_id ? "PDF" : "AULA";
  let raw = "";
  let usage: { input_tokens: number; output_tokens: number } | undefined;
  try {
    const resp = await createMessage({
      model: ASSET_MODEL,
      max_tokens: 6000,
      system: config.systemPrompt,
      messages: [
        {
          role: "user",
          content: buildJsonUserMessage(source, complementaryContext, sourceLabel),
        },
      ],
    });
    const block = resp.content.find((b) => b.type === "text");
    raw = block && block.type === "text" ? block.text : "";
    if (resp.usage) {
      usage = {
        input_tokens: resp.usage.input_tokens,
        output_tokens: resp.usage.output_tokens,
      };
    }
  } catch (err) {
    await refund("llm_error");
    return { ok: false, error: `LLM error: ${(err as Error).message}` };
  }

  const parsed = config.parsePayload(raw);
  if (!parsed) {
    await refund("parse_failed");
    return { ok: false, error: "Resposta do LLM em formato inválido." };
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    ...parsed,
  };

  const { data: assetRow, error: assetErr } = await admin
    .from("lecture_assets")
    .insert({
      user_id: source.userId,
      lecture_id: item.source_lecture_id,
      document_id: item.source_document_id,
      kind: config.kind,
      payload,
      coins_spent: config.cost,
    })
    .select("id")
    .single();

  if (assetErr || !assetRow) {
    await refund("save_failed");
    return { ok: false, error: `Save failed: ${assetErr?.message ?? "no row"}` };
  }

  const assetId = (assetRow as { id: string }).id;

  await admin
    .from("study_plan_items")
    .update({
      asset_id: assetId,
      status: "done",
      error_message: null,
    })
    .eq("id", item.id);

  if (usage) {
    void logAiUsage({
      userId: source.userId,
      endpoint: `/api/cron/study-plan-generator:${config.endpointLabel}`,
      model: ASSET_MODEL,
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
      coinsCharged: config.cost,
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
    recovered: 0,
  };

  // Recovery de items stuck: alguns LLM calls passam do maxDuration da
  // função Vercel e o worker é killed antes de marcar done/failed. Esses
  // items ficam em `generating` pra sempre porque o filtro do select
  // pega só `pending`. Aqui detectamos pelo `updated_at` mais antigo
  // que STUCK_RECOVERY_MS e devolvemos pra fila.
  try {
    const cutoff = new Date(Date.now() - STUCK_RECOVERY_MS).toISOString();
    let recoverQ = admin
      .from("study_plan_items")
      .update({
        status: "pending",
        error_message:
          "Retomada automática — geração anterior demorou demais.",
      })
      .eq("status", "generating")
      .lt("updated_at", cutoff)
      .select("id");
    if (restrictPlanIds && restrictPlanIds.length > 0) {
      recoverQ = recoverQ.in("plan_id", restrictPlanIds);
    }
    const { data: recoveredRows } = await recoverQ;
    summary.recovered = (recoveredRows ?? []).length;
  } catch (err) {
    console.warn("[plan-worker] stuck recovery failed", err);
  }

  for (let i = 0; i < MAX_PER_RUN; i++) {
    // 1) Pega 1 item pending com source (document OU lecture, single OU
    //    arrays), ordem FIFO. O filtro `.or` cobre os 4 caminhos.
    let q = admin
      .from("study_plan_items")
      .select(
        "id, plan_id, kind, source_document_id, source_lecture_id, source_document_ids, source_lecture_ids, title",
      )
      .eq("status", "pending")
      .or(
        "source_document_id.not.is.null,source_lecture_id.not.is.null,source_document_ids.not.eq.{},source_lecture_ids.not.eq.{}",
      )
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

    // 3) Valida kind. Kinds suportados: summary, flashcards, quiz, mindmap.
    const supportedKinds = new Set(["summary", "flashcards", "quiz", "mindmap"]);
    if (!supportedKinds.has(item.kind)) {
      await admin
        .from("study_plan_items")
        .update({
          status: "failed",
          error_message: `Tipo "${item.kind}" não suportado pelo worker.`,
        })
        .eq("id", item.id);
      summary.unsupported++;
      continue;
    }

    // 4) Lê sources — combina arrays + fallback singulares. Quando há
    //    múltiplos PDFs/aulas (UX de tópicos), concatena em seções claras
    //    pra Lumi entender que são DIFERENTES materiais sobre o mesmo tema.
    const docIds = [
      ...(item.source_document_ids ?? []),
      ...(item.source_document_id && !item.source_document_ids?.includes(item.source_document_id)
        ? [item.source_document_id]
        : []),
    ];
    const lecIds = [
      ...(item.source_lecture_ids ?? []),
      ...(item.source_lecture_id && !item.source_lecture_ids?.includes(item.source_lecture_id)
        ? [item.source_lecture_id]
        : []),
    ];

    let source: ItemSource | null = null;
    let userIdForItem = "";
    const parts: string[] = [];

    if (docIds.length > 0) {
      const { data: docsRaw } = await admin
        .from("documents")
        .select("user_id, title, source_text")
        .in("id", docIds);
      for (const d of (docsRaw ?? []) as Array<{
        user_id: string;
        title: string;
        source_text: string | null;
      }>) {
        userIdForItem = d.user_id;
        if (d.source_text && d.source_text.trim()) {
          parts.push(
            `## PDF: ${d.title}\n\n${d.source_text.trim()}`,
          );
        }
      }
    }
    if (lecIds.length > 0) {
      const { data: lecsRaw } = await admin
        .from("lectures")
        .select("user_id, title, transcript")
        .in("id", lecIds);
      for (const l of (lecsRaw ?? []) as Array<{
        user_id: string;
        title: string;
        transcript: string | null;
      }>) {
        userIdForItem = l.user_id;
        if (l.transcript && l.transcript.trim()) {
          parts.push(
            `## AULA GRAVADA: ${l.title}\n\n${l.transcript.trim()}`,
          );
        }
      }
    }

    if (userIdForItem && parts.length > 0) {
      source = {
        userId: userIdForItem,
        title: item.title,
        text: parts.join("\n\n---\n\n"),
      };
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
    //    Exclui TODOS os sources já usados no tópico atual pra não duplicar.
    let complementaryContext = "";
    try {
      complementaryContext = await loadComplementaryContext(
        admin,
        item.plan_id,
        source.userId,
        docIds,
        lecIds,
      );
    } catch (err) {
      console.warn("[plan-worker] complementary context failed", err);
    }

    // 6) Normaliza item pros handlers: garante que source_document_id e
    //    source_lecture_id estejam preenchidos com o primeiro elemento
    //    do array correspondente quando o singular for null. Os handlers
    //    usam os singulares pra linkar o asset (summary.document_id, etc).
    const normalizedItem: PlanItemRow = {
      ...item,
      source_document_id: item.source_document_id ?? docIds[0] ?? null,
      source_lecture_id: item.source_lecture_id ?? lecIds[0] ?? null,
    };

    // 7) Processa conforme o kind
    let result: { ok: boolean; error?: string };
    if (item.kind === "summary") {
      result = await processSummaryItem(
        admin,
        normalizedItem,
        source,
        complementaryContext,
      );
    } else if (item.kind === "flashcards") {
      result = await processJsonAssetItem(
        admin,
        normalizedItem,
        source,
        complementaryContext,
        FLASHCARDS_CONFIG,
      );
    } else if (item.kind === "quiz") {
      result = await processJsonAssetItem(
        admin,
        normalizedItem,
        source,
        complementaryContext,
        QUIZ_CONFIG,
      );
    } else {
      // mindmap
      result = await processJsonAssetItem(
        admin,
        normalizedItem,
        source,
        complementaryContext,
        MINDMAP_CONFIG,
      );
    }
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
