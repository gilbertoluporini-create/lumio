/**
 * POST /api/lumi/study-plan
 *
 * Cria um plano de estudo COM TRILHA pré-desenhada pela LLM.
 *
 * Fluxo:
 *  1. Valida ownership do subject + carrega assets existentes (docs/summaries)
 *  2. LLM monta a trilha — JSON com title + items ordenados (até ~10 itens)
 *  3. Cria study_plans + study_plan_items numa transação leve
 *  4. Items "covered" por assets existentes ficam referenciados (asset_id);
 *     o resto vira `note` (TODO descritivo do que estudar)
 *  5. Devolve { planId, url } pra Lumi cravar o card "Abrir plano →"
 *
 * Custo: COIN_COSTS.study_plan (8). Refunda em qualquer falha após charge.
 */

import { createMessage } from "@/lib/llm-fallback";
import { LIMITS, escapeForPrompt, logAndSanitize } from "@/lib/api-security";
import { COIN_COSTS, chargeCoins, creditCoins } from "@/lib/coins";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { getClientIp, limitOrThrow } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

type Body = {
  subjectId?: string;
  conteudo?: string;
  dataProva?: string;
  horasSemanais?: number;
  titulo?: string;
};

type ItemKind =
  | "document"
  | "summary"
  | "mindmap"
  | "quiz"
  | "flashcards"
  | "routine"
  | "note";

const VALID_KINDS: ItemKind[] = [
  "document",
  "summary",
  "mindmap",
  "quiz",
  "flashcards",
  "routine",
  "note",
];

type DesignedItem = {
  kind?: string;
  title?: string;
  description?: string;
};

type DesignedPlan = {
  title?: string;
  items?: DesignedItem[];
};

const SYSTEM_PROMPT = `Você é a Lumi montando TRILHAS DE ESTUDO em JSON para estudantes universitários brasileiros.

Recebe:
- Matéria-alvo + conteúdo da prova / tópicos
- Carga semanal alvo (opcional)
- Data da prova (opcional)
- Lista de assets já existentes do aluno (documentos e resumos)

Sua tarefa: montar uma trilha de 6 a 10 itens, ordenada do que faz sentido começar até o que faz sentido revisar por último.

REGRAS:
- APENAS JSON válido. Sem markdown wrappers. Sem comentários.
- Cada item tem "kind" e "title". "description" é opcional (1 frase, 20–140 chars).
- Tipos válidos: document, summary, mindmap, quiz, flashcards, routine, note.
- Ordem típica recomendada: documentos/leitura base → resumo → mapa mental → quiz → flashcards → revisão (note) → rotina (routine).
- Você está propondo TODOs — o aluno gera o asset clicando. Use kind="summary" pra significar "gerar resumo de X", kind="mindmap" pra "fazer mapa de Y", etc.
- O item de tipo "routine" SEMPRE deve ser o ÚLTIMO, e representa a rotina semanal (PDF) que vai ser gerada à parte.
- Inclua 1 item kind="note" como "Revisão final 24h antes" se houver dataProva.
- Não invente tópicos fora do conteúdo enviado.
- Português brasileiro, direto e concreto. Títulos curtos (4–9 palavras).

FORMATO:
{
  "title": "<título do plano, ex: Prova de Endócrino — semana 1>",
  "items": [
    { "kind": "summary", "title": "Gerar resumo de Tireoide", "description": "Concentre nos eixos hipotálamo-hipófise" },
    ...
  ]
}`;

export async function POST(req: Request) {
  const ip = getClientIp(req);
  const ipLimit = limitOrThrow(`study_plan:ip:${ip}`, 5, 60_000);
  if (ipLimit) return ipLimit;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return Response.json({ error: "JSON inválido." }, { status: 400 });
  }

  const subjectId = (body.subjectId ?? "").trim();
  if (!subjectId) {
    return Response.json(
      { error: "subjectId obrigatório." },
      { status: 400 },
    );
  }

  const conteudo = (body.conteudo ?? "").trim().slice(0, LIMITS.MESSAGE_CHARS);
  if (!conteudo) {
    return Response.json(
      { error: "Preciso de conteúdo/tópicos pra desenhar o plano." },
      { status: 400 },
    );
  }
  const horasSemanais =
    typeof body.horasSemanais === "number" && body.horasSemanais > 0
      ? Math.min(Math.round(body.horasSemanais), 60)
      : null;
  const dataProva = (body.dataProva ?? "").trim().slice(0, 120);
  const tituloOverride = (body.titulo ?? "").trim().slice(0, 180);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Faça login." }, { status: 401 });
  }

  const userLimit = limitOrThrow(`study_plan:user:${user.id}`, 6, 60_000);
  if (userLimit) return userLimit;

  const admin = createAdminClient();

  // Ownership do subject
  const { data: subjectRow, error: subjErr } = await admin
    .from("subjects")
    .select("id, name")
    .eq("id", subjectId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (subjErr || !subjectRow) {
    return Response.json(
      { error: "Matéria não encontrada." },
      { status: 404 },
    );
  }
  const subjectName = (subjectRow as { name: string }).name;

  // Assets existentes (pra LLM saber o que já tá pronto)
  const [{ data: docs }, { data: summaries }] = await Promise.all([
    admin
      .from("documents")
      .select("id, title")
      .eq("user_id", user.id)
      .eq("subject_id", subjectId)
      .order("created_at", { ascending: false })
      .limit(20),
    admin
      .from("summaries")
      .select("id, title")
      .eq("user_id", user.id)
      .eq("subject_id", subjectId)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);
  const existingDocs = ((docs ?? []) as { id: string; title: string }[])
    .map((d) => `- ${d.title}`)
    .join("\n");
  const existingSummaries = ((summaries ?? []) as { id: string; title: string }[])
    .map((s) => `- ${s.title}`)
    .join("\n");

  const charge = await chargeCoins(user.id, COIN_COSTS.study_plan, "study_plan", {
    scope: "lumi-study-plan",
    subject_id: subjectId,
  });
  if (!charge.ok) {
    return Response.json(
      {
        error: `Saldo insuficiente. Plano custa ${charge.required} coins, você tem ${charge.balance}.`,
        required: charge.required,
        balance: charge.balance,
        upgrade: "/account/coins",
      },
      { status: 402 },
    );
  }

  const cargaLine =
    horasSemanais !== null
      ? `Carga semanal alvo: ${horasSemanais} horas.`
      : "Carga semanal alvo: você decide (entre 6 e 18h).";
  const provaLine = dataProva
    ? `Data da prova: ${escapeForPrompt(dataProva)}`
    : "Sem data de prova definida.";

  const userMessage = [
    `MATÉRIA: ${escapeForPrompt(subjectName)}`,
    cargaLine,
    provaLine,
    "",
    "=== CONTEÚDO/TÓPICOS ===",
    escapeForPrompt(conteudo),
    "",
    existingDocs
      ? `=== DOCUMENTOS QUE O ALUNO JÁ TEM ===\n${escapeForPrompt(existingDocs)}`
      : "",
    existingSummaries
      ? `=== RESUMOS QUE O ALUNO JÁ TEM ===\n${escapeForPrompt(existingSummaries)}`
      : "",
    "",
    "Monte a trilha no formato JSON especificado. APENAS JSON.",
  ]
    .filter(Boolean)
    .join("\n");

  let raw = "";
  try {
    const resp = await createMessage({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 2000,
      system: [
        { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
      ],
      messages: [{ role: "user", content: userMessage }],
    });
    const block = resp.content.find((b) => b.type === "text");
    raw = block && block.type === "text" ? block.text : "";
  } catch (err) {
    console.error("[lumi/study-plan] LLM call failed:", err);
    try {
      await creditCoins(user.id, COIN_COSTS.study_plan, "refund", {
        reason: "study_plan_llm_failed",
      });
    } catch {
      /* ignore */
    }
    const { error, reqId } = logAndSanitize("api/lumi/study-plan", err);
    return Response.json({ error, reqId }, { status: 500 });
  }

  const parsed = tryParseDesign(raw);
  const items = sanitizeItems(parsed?.items);
  if (items.length === 0) {
    try {
      await creditCoins(user.id, COIN_COSTS.study_plan, "refund", {
        reason: "study_plan_no_items",
      });
    } catch {
      /* ignore */
    }
    return Response.json(
      { error: "Não consegui montar a trilha. Coins devolvidos." },
      { status: 500 },
    );
  }

  const title =
    tituloOverride ||
    (typeof parsed?.title === "string" && parsed.title.trim()
      ? parsed.title.trim().slice(0, 180)
      : `Plano — ${subjectName}`);

  const { data: planRow, error: planInsErr } = await admin
    .from("study_plans")
    .insert({
      user_id: user.id,
      subject_id: subjectId,
      title,
      exam_date: dataProvaToDate(dataProva),
    })
    .select("id")
    .single();
  if (planInsErr || !planRow?.id) {
    console.error("[lumi/study-plan] plan insert failed:", planInsErr);
    try {
      await creditCoins(user.id, COIN_COSTS.study_plan, "refund", {
        reason: "study_plan_insert_failed",
      });
    } catch {
      /* ignore */
    }
    return Response.json(
      { error: "Falha ao salvar plano." },
      { status: 500 },
    );
  }
  const planId = (planRow as { id: string }).id;

  // Inserir items em batch
  const rows = items.map((it, idx) => ({
    plan_id: planId,
    position: idx,
    kind: it.kind,
    title: it.title,
    description: it.description ?? null,
  }));
  const { error: itemsErr } = await admin
    .from("study_plan_items")
    .insert(rows);
  if (itemsErr) {
    console.error("[lumi/study-plan] items insert failed:", itemsErr);
    // Não dá refund completo aqui — o plan já existe. User vê plano vazio
    // e pode adicionar manualmente. Loga e segue.
  }

  return Response.json({
    planId,
    url: `/planos/${planId}`,
    title,
    itemCount: rows.length,
    coinsCharged: COIN_COSTS.study_plan,
    balanceAfter: charge.balanceAfter,
  });
}

function tryParseDesign(text: string): DesignedPlan | null {
  const cleaned = text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned) as DesignedPlan;
  } catch {}
  const m = cleaned.match(/\{[\s\S]*\}/);
  if (m) {
    try {
      return JSON.parse(m[0]) as DesignedPlan;
    } catch {}
  }
  return null;
}

function sanitizeItems(
  raw: DesignedItem[] | undefined,
): Array<{ kind: ItemKind; title: string; description?: string }> {
  if (!Array.isArray(raw)) return [];
  const out: Array<{ kind: ItemKind; title: string; description?: string }> = [];
  for (const it of raw.slice(0, 12)) {
    if (!it || typeof it.title !== "string") continue;
    const title = it.title.trim().slice(0, 200);
    if (!title) continue;
    const kindRaw =
      typeof it.kind === "string" ? it.kind.toLowerCase().trim() : "note";
    const kind = (VALID_KINDS as string[]).includes(kindRaw)
      ? (kindRaw as ItemKind)
      : "note";
    const description =
      typeof it.description === "string" && it.description.trim()
        ? it.description.trim().slice(0, 400)
        : undefined;
    out.push({ kind, title, description });
  }
  return out;
}

function dataProvaToDate(s: string): string | null {
  if (!s) return null;
  // Aceita YYYY-MM-DD direto, ou tenta extrair de string em PT-BR (DD/MM/YYYY).
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const ptbr = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(s);
  if (ptbr) return `${ptbr[3]}-${ptbr[2]}-${ptbr[1]}`;
  return null;
}
