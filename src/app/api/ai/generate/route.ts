/**
 * POST /api/ai/generate — endpoint unificado do wizard de geração AI.
 *
 * Suporta mode = "summary" | "flashcards" | "quiz" | "mindmap".
 * Fontes: transcripts (de aulas existentes) + pdfTexts (de PDFs upados).
 * Opções: withImages, userInstructions, count, depth, level, difficulty, complexity.
 *
 * Fluxo:
 *  1. Auth (Supabase).
 *  2. Calcula custo via computeCost(mode, withImages).
 *  3. Verifica saldo; se insuficiente → 402.
 *  4. Chama Claude Sonnet 4.5 com prompt apropriado pro mode (com prompt caching).
 *  5. Se withImages: identifica 3-4 conceitos-chave e chama /api/ai/generate-images
 *     internamente; insere as URLs no markdown como ![](url).
 *  6. Debita coins via chargeCoins.
 *  7. Retorna { mode, content, imageUrls?, coinsCharged, balanceAfter }.
 */

import Anthropic from "@anthropic-ai/sdk";
import { LIMITS, escapeForPrompt, logAndSanitize } from "@/lib/api-security";
import { chargeCoins, creditCoins, getBalance } from "@/lib/coins";
import { computeCost, type AIMode } from "@/lib/coins-pricing";
import { checkDailyCostCap, dailyCapResponse } from "@/lib/cost-cap";
import { isFeatureEnabled, featureDisabledResponse } from "@/lib/feature-flags";
import { createClient } from "@/lib/supabase/server";
import { getClientIp, limitOrThrow } from "@/lib/rate-limit";
import { logAiUsage } from "@/lib/ai-usage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 240;

const MODEL = "claude-sonnet-4-5-20250929";

type Sources = {
  transcripts?: string[];
  pdfTexts?: string[];
};

type Options = {
  withImages?: boolean;
  userInstructions?: string;
  count?: number;
  depth?: "concise" | "standard" | "detailed";
  level?: "beginner" | "intermediate" | "advanced";
  difficulty?: "easy" | "medium" | "hard";
  complexity?: "simple" | "medium" | "deep";
};

type AttachmentPayload = {
  name: string;
  content: string;
};

type Body = {
  mode: AIMode;
  sources?: Sources;
  options?: Options;
  attachments?: AttachmentPayload[];
};

const MAX_ATTACHMENTS = 5;

function mergeAttachmentsIntoSources(
  sources: Sources,
  attachments: AttachmentPayload[] | undefined,
): Sources {
  if (!Array.isArray(attachments) || attachments.length === 0) return sources;
  const extra: string[] = [];
  for (const a of attachments.slice(0, MAX_ATTACHMENTS)) {
    if (
      a &&
      typeof a.content === "string" &&
      a.content.trim().length > 0
    ) {
      const name = typeof a.name === "string" ? a.name.slice(0, 160) : "Anexo";
      extra.push(`=== ${name} ===\n${a.content}`);
    }
  }
  if (extra.length === 0) return sources;
  return {
    transcripts: sources.transcripts,
    pdfTexts: [...(sources.pdfTexts ?? []), ...extra],
  };
}

/* ------------------------------------------------------------------ */
/*  Prompts por mode                                                   */
/* ------------------------------------------------------------------ */

const INSUFFICIENT_GUARD = `GUARDA DE INSUFICIÊNCIA DE FONTES (regra absoluta, anterior a TODAS as outras):
- Antes de gerar qualquer coisa, verifique se as fontes (transcrição + slides + PDFs) contêm conteúdo técnico real e específico sobre o tema solicitado, com no mínimo ~600 caracteres de material substantivo.
- Se as fontes estiverem vazias, forem só uma conversa de chat sobre intenção de estudar (ex: "quero estudar X"), forem só metadados (títulos sem corpo), forem fragmentos genéricos, ou contradizerem o tema solicitado → responda EXCLUSIVAMENTE com a string literal a seguir e NADA MAIS:
INSUFFICIENT_SOURCE
- Não escreva avisos no corpo do resumo (proibido: "Aviso importante: as fontes não continham material processado"). Não use conhecimento geral pra preencher lacuna. Não invente conteúdo do programa típico da matéria. A única resposta aceita nesse caso é o marcador literal acima.`;

const SYSTEM_SUMMARY = `Você é um TUTOR universitário brasileiro experiente criando um RESUMO DIDÁTICO COMPLETO de uma aula.

Recebe trechos de aulas (transcrições, slides, PDFs) e gera um resumo em MARKDOWN coeso, profundo e altamente educativo. O objetivo é que o estudante leia esse resumo SEM ter assistido a aula original e ainda assim domine o conteúdo pra uma prova.

${INSUFFICIENT_GUARD}

ANCORAMENTO NAS FONTES (regra crítica):
- Use TODO o conteúdo relevante das fontes (transcrição + slides + PDFs). Não pule blocos.
- Cite explicitamente quando algo vier das fontes ("como o professor mencionou", "no slide X", "no PDF do material").
- Para CADA conceito do resumo, deve existir base nas fontes. Se algo é conhecimento geral complementar, marque com "(complemento — não estava nas fontes)".
- Se as fontes contradizerem entre si, aponte isso explicitamente.
- NUNCA invente dados específicos (números, nomes, casos, citações) que não estejam nas fontes.

ESTRUTURA OBRIGATÓRIA (em markdown):
1. Título principal: # H1 representativo do tema central
2. **Visão geral** (3-5 frases): contexto, importância clínica/prática, e o que o estudante vai aprender
3. **4 a 7 seções ## H2 numeradas** cobrindo os blocos principais. Cada seção deve ter:
   - Parágrafo de definição clara do conceito
   - Explicação aprofundada do MECANISMO/funcionamento (não só "é X", mas "POR QUE / COMO")
   - Listas com **bold** nos termos-chave
   - Pelo menos 1 EXEMPLO prático ou clínico citado da fonte (se houver) ou conhecimento padrão da área
   - Callout iniciado com "> " destacando pontos de ARMADILHA, ERRO COMUM ou DICA DE PROVA quando aplicável
   - Use tabelas markdown ao COMPARAR/CLASSIFICAR (ex: tipos, fases, etiologias)
4. Seção **## Aplicação clínica/prática** com 1-3 cenários reais conectando os conceitos
5. Seção final **## Pontos-chave de revisão** com 6-10 bullets curtos resumindo o essencial

LINGUAGEM:
- Português brasileiro, tom de professor didático conversando com aluno do 4º semestre
- Sem encheção, sem repetições óbvias
- Use **negrito** em termos técnicos chave (não em frases inteiras)
- Marque conceitos importantes entre [[ ]] — ex: [[reação em cadeia da polimerase]] — vão virar destaque visual
- Quando termo técnico aparecer pela primeira vez, defina entre parênteses se for complexo

PROFUNDIDADE TARGET:
- "Conciso": 600-1000 palavras
- "Padrão": 1200-2000 palavras
- "Detalhado": 2500-4000 palavras
Cumpra a profundidade pedida — nunca entregar mais curto que o esperado.

REGRA DE ESTILO:
- NUNCA use emojis.
- NUNCA use cercas de código com \`\`\`.
- Use separador horizontal --- somente se realmente fizer sentido entre macro-blocos (raro).

Quando withImages=true, mantenha o markdown limpo — o sistema vai inserir imagens nos lugares apropriados, intercaladas entre as seções.`;

const SYSTEM_FLASHCARDS = `Você gera FLASHCARDS de revisão pra estudantes universitários brasileiros.

${INSUFFICIENT_GUARD}

REGRAS:
- Responda APENAS com JSON válido. Sem markdown wrappers.
- Crie EXATAMENTE o número solicitado de cards.
- Cada card: 1 conceito-chave. Pergunta direta (1 frase), resposta concisa (1-3 frases).
- Inclua "hint" opcional e "difficulty" (easy|medium|hard).
- Variedade: definições, fatos, comparações, aplicações.
- NÃO invente conteúdo fora das fontes.

FORMATO:
{
  "title": "<título curto do deck>",
  "cards": [
    { "question": "...", "answer": "...", "hint": "...", "difficulty": "easy|medium|hard" }
  ]
}`;

const SYSTEM_QUIZ = `Você gera QUIZZES de revisão pra estudantes universitários brasileiros.

${INSUFFICIENT_GUARD}

REGRAS:
- Responda APENAS com JSON válido. Sem markdown wrappers.
- Crie EXATAMENTE o número solicitado de questões.
- Cada questão: 4 alternativas, apenas UMA correta.
- correctIndex: 0|1|2|3.
- DISTRIBUA correctIndex de forma EQUILIBRADA entre 0, 1, 2 e 3 ao longo do quiz.
  Em um quiz de N questões, cada índice deve aparecer aproximadamente N/4 vezes.
  Não enviese pra 0 — varie a posição da resposta correta a cada questão.
- explanation: 1-2 frases explicando a resposta correta.
- Variedade: fatos, conceitos, aplicações, raciocínio.
- NÃO invente fora das fontes.

FORMATO (correctIndex varia, NÃO é sempre 0):
{
  "title": "<título curto do quiz>",
  "questions": [
    {
      "question": "<enunciado q1>",
      "options": ["...", "...", "...", "..."],
      "correctIndex": 2,
      "explanation": "<por que está correta>"
    },
    {
      "question": "<enunciado q2>",
      "options": ["...", "...", "...", "..."],
      "correctIndex": 0,
      "explanation": "..."
    },
    {
      "question": "<enunciado q3>",
      "options": ["...", "...", "...", "..."],
      "correctIndex": 3,
      "explanation": "..."
    }
  ]
}`;

const SYSTEM_MINDMAP = `Você gera MAPAS MENTAIS de aulas universitárias em português brasileiro.

${INSUFFICIENT_GUARD}

REGRAS:
- Responda APENAS com JSON válido. Sem markdown wrappers.
- centralTopic: 1 frase curta do tema central.
- branches: 3-6 ramos principais.
- Cada branch pode ter 2-5 children (até 3 níveis de profundidade).
- label: 1-4 palavras. detail (opcional): 1 frase de contexto.
- NÃO invente fora das fontes.

FORMATO:
{
  "title": "<título curto>",
  "centralTopic": "<tema central>",
  "branches": [
    {
      "label": "<ramo>",
      "detail": "<opcional>",
      "children": [
        { "label": "<sub>", "children": [{ "label": "<detalhe>" }] }
      ]
    }
  ]
}`;

function getSystemPrompt(mode: AIMode): string {
  switch (mode) {
    case "summary":
      return SYSTEM_SUMMARY;
    case "flashcards":
      return SYSTEM_FLASHCARDS;
    case "quiz":
      return SYSTEM_QUIZ;
    case "mindmap":
      return SYSTEM_MINDMAP;
  }
}

/* ------------------------------------------------------------------ */
/*  Builders                                                            */
/* ------------------------------------------------------------------ */

function buildSourcesBlock(sources: Sources): string {
  const blocks: string[] = [];
  const transcripts = sources.transcripts ?? [];
  const pdfTexts = sources.pdfTexts ?? [];

  transcripts.forEach((t, i) => {
    const clean = t.trim();
    if (!clean) return;
    blocks.push(`=== TRANSCRIÇÃO ${i + 1} ===\n${escapeForPrompt(clean)}`);
  });
  pdfTexts.forEach((p, i) => {
    const clean = p.trim();
    if (!clean) return;
    blocks.push(`=== PDF ${i + 1} ===\n${escapeForPrompt(clean)}`);
  });

  if (blocks.length === 0) return "(Nenhuma fonte fornecida.)";
  return blocks.join("\n\n");
}

function buildOptionsLine(mode: AIMode, opts: Options): string {
  const lines: string[] = [];
  if (mode === "summary") {
    const depthLabel =
      opts.depth === "concise"
        ? "Conciso (1-2 páginas)"
        : opts.depth === "detailed"
          ? "Detalhado (5+ páginas)"
          : "Padrão (2-4 páginas)";
    lines.push(`Profundidade: ${depthLabel}`);
  }
  if (mode === "flashcards") {
    const n = Math.min(Math.max(opts.count ?? 15, 5), 30);
    const lvl =
      opts.level === "beginner"
        ? "Iniciante"
        : opts.level === "advanced"
          ? "Avançado"
          : "Intermediário";
    lines.push(`Quantidade: ${n} cards`);
    lines.push(`Nível: ${lvl}`);
  }
  if (mode === "quiz") {
    const n = Math.min(Math.max(opts.count ?? 10, 5), 20);
    const diff =
      opts.difficulty === "easy"
        ? "Fácil"
        : opts.difficulty === "hard"
          ? "Difícil"
          : "Médio";
    lines.push(`Quantidade: ${n} questões`);
    lines.push(`Dificuldade: ${diff}`);
  }
  if (mode === "mindmap") {
    const cx =
      opts.complexity === "simple"
        ? "Simples (até 2 níveis)"
        : opts.complexity === "deep"
          ? "Profundo (até 3 níveis, muitos sub-ramos)"
          : "Médio (2-3 níveis)";
    lines.push(`Complexidade: ${cx}`);
  }
  return lines.join("\n");
}

function buildUserMessage(mode: AIMode, body: Body, sourcesOverride?: Sources): string {
  const sources = sourcesOverride ?? body.sources ?? {};
  const opts = body.options ?? {};
  const sourcesBlock = buildSourcesBlock(sources);
  const optsLine = buildOptionsLine(mode, opts);
  const userInstr = (opts.userInstructions ?? "").trim();
  const instructionsBlock = userInstr
    ? `\n\n=== INSTRUÇÕES EXTRAS DO ESTUDANTE ===\n${escapeForPrompt(userInstr)}`
    : "";

  const target =
    mode === "summary"
      ? "Gere o resumo em markdown agora."
      : mode === "flashcards"
        ? "Gere os flashcards no JSON especificado. APENAS JSON."
        : mode === "quiz"
          ? "Gere o quiz no JSON especificado. APENAS JSON."
          : "Gere o mapa mental no JSON especificado. APENAS JSON.";

  return `${optsLine ? `=== OPÇÕES ===\n${optsLine}\n\n` : ""}=== FONTES ===\n${sourcesBlock}${instructionsBlock}\n\n${target}`;
}

/* ------------------------------------------------------------------ */
/*  Validação e limites                                                 */
/* ------------------------------------------------------------------ */

function sanitizeSources(sources: Sources): Sources {
  const transcripts = (sources.transcripts ?? [])
    .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
    .map((s) => s.slice(0, LIMITS.TRANSCRIPT_CHARS));
  const pdfTexts = (sources.pdfTexts ?? [])
    .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
    .map((s) => s.slice(0, LIMITS.TRANSCRIPT_CHARS));
  return { transcripts, pdfTexts };
}

function totalSourceChars(sources: Sources): number {
  const a = (sources.transcripts ?? []).reduce((n, s) => n + s.length, 0);
  const b = (sources.pdfTexts ?? []).reduce((n, s) => n + s.length, 0);
  return a + b;
}

/* ------------------------------------------------------------------ */
/*  Image enrichment                                                    */
/* ------------------------------------------------------------------ */

/**
 * Extrai 3-4 conceitos-chave do markdown — primeiro tenta [[termos]],
 * depois cabeçalhos H2.
 */
function extractImageConcepts(markdown: string, max: number = 2): string[] {
  // Coleta candidatos: [[concept]] primeiro, depois títulos ## como fallback
  const candidates: string[] = [];
  const re = /\[\[([^\]]+)\]\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(markdown)) !== null) {
    const term = m[1].trim();
    if (term && term.length <= 80) candidates.push(term);
  }
  const h2Re = /^##\s+(.+)$/gm;
  let h: RegExpExecArray | null;
  while ((h = h2Re.exec(markdown)) !== null) {
    const t = h[1]
      .replace(/^\d+\.\s*/, "")
      .replace(/^Pontos-chave.*/i, "")
      .replace(/^Aplicação cl[ií]nica.*/i, "")
      .trim();
    if (t && t.length <= 80) candidates.push(t);
  }

  // Dedup semântico: rejeita conceitos cujo texto (lowercase, sem palavras
  // comuns) tenha >60% de overlap com algum já aceito. Evita "PCR" + "Reação
  // em cadeia da polimerase" virarem 2 imagens visualmente iguais.
  const STOPWORDS = new Set([
    "de", "da", "do", "e", "a", "o", "em", "no", "na", "que", "para",
    "com", "por", "um", "uma", "os", "as", "dos", "das",
  ]);
  const tokenize = (s: string) =>
    new Set(
      s
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .split(/[^a-z0-9]+/)
        .filter((t) => t.length >= 3 && !STOPWORDS.has(t)),
    );
  const accepted: { raw: string; tokens: Set<string> }[] = [];
  for (const c of candidates) {
    if (accepted.length >= max) break;
    const tokens = tokenize(c);
    if (tokens.size === 0) continue;
    let dup = false;
    for (const a of accepted) {
      const overlap = [...tokens].filter((t) => a.tokens.has(t)).length;
      const minSize = Math.min(tokens.size, a.tokens.size);
      if (minSize > 0 && overlap / minSize > 0.6) {
        dup = true;
        break;
      }
    }
    if (!dup) accepted.push({ raw: c, tokens });
  }
  return accepted.map((a) => a.raw);
}

async function callImageEndpoint(
  prompts: string[],
  origin: string,
  cookie: string,
): Promise<string[]> {
  if (prompts.length === 0) return [];
  try {
    const resp = await fetch(`${origin}/api/ai/generate-images`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie,
      },
      body: JSON.stringify({ prompts }),
    });
    if (!resp.ok) {
      console.warn("[ai/generate] image endpoint non-ok", resp.status);
      return [];
    }
    const json = (await resp.json()) as { urls?: string[] };
    return Array.isArray(json.urls) ? json.urls : [];
  } catch (err) {
    console.error("[ai/generate] image endpoint failed", err);
    return [];
  }
}

/** Insere ![concept](url) após cada H2 da seção correspondente. */
function injectImagesIntoMarkdown(
  markdown: string,
  concepts: string[],
  urls: string[],
): string {
  if (urls.length === 0) return markdown;
  let out = markdown;

  // Insere abaixo do título principal (primeira ocorrência de H1)
  const firstImage = urls[0];
  const firstConcept = concepts[0] ?? "Ilustração";
  out = out.replace(
    /^(# .+)$/m,
    `$1\n\n![${firstConcept}](${firstImage})`,
  );

  // Para o resto, tenta posicionar logo após H2 com conceito relacionado
  for (let i = 1; i < urls.length; i++) {
    const c = concepts[i] ?? `Ilustração ${i + 1}`;
    const url = urls[i];
    const lowerC = c.toLowerCase();
    const lines = out.split("\n");
    let inserted = false;
    for (let j = 0; j < lines.length; j++) {
      if (
        lines[j].startsWith("## ") &&
        lines[j].toLowerCase().includes(lowerC.slice(0, 12))
      ) {
        lines.splice(j + 1, 0, "", `![${c}](${url})`, "");
        inserted = true;
        break;
      }
    }
    out = lines.join("\n");
    if (!inserted) {
      // Append no fim do doc se não achou seção
      out += `\n\n![${c}](${url})\n`;
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/*  JSON parsing                                                        */
/* ------------------------------------------------------------------ */

function stripCodeFences(s: string): string {
  return s
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
}

function tryParseJson<T = unknown>(text: string): T | null {
  const cleaned = stripCodeFences(text);
  try {
    return JSON.parse(cleaned) as T;
  } catch {}
  const m = cleaned.match(/\{[\s\S]*\}/);
  if (m) {
    try {
      return JSON.parse(m[0]) as T;
    } catch {}
  }
  return null;
}

/* ------------------------------------------------------------------ */
/*  POST                                                                */
/* ------------------------------------------------------------------ */

export async function POST(req: Request) {
  const ip = getClientIp(req);
  const ipLimit = limitOrThrow(`ai-generate:ip:${ip}`, 5, 60_000);
  if (ipLimit) return ipLimit;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return Response.json({ error: "JSON inválido." }, { status: 400 });
  }

  const mode = body.mode;
  if (
    mode !== "summary" &&
    mode !== "flashcards" &&
    mode !== "quiz" &&
    mode !== "mindmap"
  ) {
    return Response.json({ error: "Modo inválido." }, { status: 400 });
  }

  const sourcesWithAttachments = mergeAttachmentsIntoSources(
    body.sources ?? {},
    body.attachments,
  );
  const sources = sanitizeSources(sourcesWithAttachments);
  const totalChars = totalSourceChars(sources);
  if (totalChars === 0) {
    return Response.json(
      { error: "Forneça pelo menos uma fonte (transcrição ou PDF)." },
      { status: 400 },
    );
  }
  if (totalChars > LIMITS.TRANSCRIPT_CHARS * 4) {
    return Response.json({ error: "Fontes muito longas." }, { status: 413 });
  }

  const opts = body.options ?? {};
  const withImages =
    !!opts.withImages && (mode === "summary" || mode === "flashcards" || mode === "quiz");

  // Auth
  const supabaseEnabled = !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
  if (!supabaseEnabled || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return Response.json(
      { error: "Configuração de servidor incompleta." },
      { status: 503 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Faça login." }, { status: 401 });
  }
  const userId: string = user.id;

  const userLimit = limitOrThrow(`ai-generate:user:${userId}`, 8, 60_000);
  if (userLimit) return userLimit;

  // Kill-switch global de geração IA.
  if (!(await isFeatureEnabled("features.ai_generate.enabled"))) {
    return featureDisabledResponse("features.ai_generate.enabled");
  }

  // Cap diário USD (anti-abuse). Admin/founder não tem cap.
  const cap = await checkDailyCostCap(userId);
  if (!cap.ok) return dailyCapResponse(cap);

  // Pricing — cada fonte (transcript/PDF) acima da 1ª adiciona coins extras
  // (perExtraSource). Reflete o custo real de input tokens quando o user
  // junta vários PDFs num só asset.
  const totalSources =
    (sources.transcripts?.length ?? 0) + (sources.pdfTexts?.length ?? 0);
  const cost = computeCost(mode, withImages, totalSources);
  const balance = await getBalance(userId);
  if (balance < cost) {
    return Response.json(
      {
        error: `Saldo insuficiente. ${mode === "summary" ? "Resumo" : mode === "flashcards" ? "Flashcards" : mode === "quiz" ? "Quiz" : "Mapa mental"}${withImages ? " com imagens" : ""} custa ${cost} coins, você tem ${balance}.`,
        required: cost,
        balance,
        upgrade: "/account/coins",
      },
      { status: 402 },
    );
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "ANTHROPIC_API_KEY não configurada." },
      { status: 503 },
    );
  }

  // Charge BEFORE call (reembolsa em falha)
  const reasonForCharge =
    mode === "summary"
      ? "summary"
      : mode === "flashcards"
        ? "flashcards"
        : mode === "quiz"
          ? "quiz"
          : "mindmap";
  const charge = await chargeCoins(userId, cost, reasonForCharge, {
    mode,
    with_images: withImages,
    sources_count:
      (sources.transcripts?.length ?? 0) + (sources.pdfTexts?.length ?? 0),
  });
  if (!charge.ok) {
    return Response.json(
      {
        error: `Saldo insuficiente. Precisa de ${charge.required} coins, você tem ${charge.balance}.`,
        required: charge.required,
        balance: charge.balance,
        upgrade: "/account/coins",
      },
      { status: 402 },
    );
  }

  // Refund helper
  async function refundOnFailure(reason: string) {
    try {
      await creditCoins(userId, cost, "refund", { mode, reason });
    } catch (e) {
      console.error("[ai/generate] refund failed", e);
    }
  }

  try {
    const client = new Anthropic({ apiKey });
    const systemPrompt = getSystemPrompt(mode);
    const userMessage = buildUserMessage(mode, body, sources);

    const maxTokens =
      mode === "summary"
        ? 8000
        : mode === "flashcards"
          ? 6000
          : mode === "quiz"
            ? 7000
            : 5000;

    const resp = await client.messages.create({
      model: MODEL,
      max_tokens: maxTokens,
      system: [
        {
          type: "text",
          text: systemPrompt,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: userMessage }],
    });

    const textBlock = resp.content.find((b) => b.type === "text");
    const raw = textBlock && textBlock.type === "text" ? textBlock.text : "";

    if (!raw.trim()) {
      await refundOnFailure("empty_response");
      return Response.json(
        { error: "Resposta vazia da IA. Coins devolvidos." },
        { status: 500 },
      );
    }

    // Detecta marcador de fontes insuficientes (guarda contra alucinação).
    // Claude foi instruído pelo INSUFFICIENT_GUARD a retornar exatamente este
    // token quando o material recebido não basta pra gerar o asset.
    const rawTrim = raw.trim();
    if (
      rawTrim === "INSUFFICIENT_SOURCE" ||
      rawTrim.startsWith("INSUFFICIENT_SOURCE")
    ) {
      await refundOnFailure("insufficient_source");
      return Response.json(
        {
          error:
            "Material insuficiente pra gerar esse conteúdo. Anexe um PDF com texto, grave a aula ou cole a transcrição antes de tentar de novo.",
          code: "INSUFFICIENT_SOURCE",
        },
        { status: 422 },
      );
    }

    // Image enrichment (apenas summary tem sentido inline; flashcards/quiz
    // ganham as URLs num campo separado pro front decidir como usar)
    let content: unknown = raw;
    let imageUrls: string[] = [];

    if (mode === "summary") {
      let md = raw;
      if (withImages) {
        const concepts = extractImageConcepts(md, 4);
        if (concepts.length > 0) {
          const origin = new URL(req.url).origin;
          const cookie = req.headers.get("cookie") ?? "";
          imageUrls = await callImageEndpoint(concepts, origin, cookie);
          if (imageUrls.length > 0) {
            md = injectImagesIntoMarkdown(md, concepts, imageUrls);
          }
        }
      }
      content = { markdown: md };
    } else {
      const parsed = tryParseJson<Record<string, unknown>>(raw);
      if (!parsed) {
        await refundOnFailure("invalid_json");
        return Response.json(
          { error: "Resposta inválida da IA. Coins devolvidos." },
          { status: 500 },
        );
      }
      content = parsed;

      // -----------------------------------------------------------------
      // Guard contra viés do modelo: alguns geram correctIndex=0 quase
      // sempre (copiando o exemplo do prompt). Embaralhamos options
      // mantendo correctIndex apontando pra resposta certa.
      // -----------------------------------------------------------------
      if (mode === "quiz") {
        const questions = (parsed as Record<string, unknown>).questions;
        if (Array.isArray(questions)) {
          for (const q of questions) {
            if (!q || typeof q !== "object") continue;
            const qq = q as Record<string, unknown>;
            const opts = qq.options;
            const ci = qq.correctIndex;
            if (
              Array.isArray(opts) &&
              opts.length >= 2 &&
              typeof ci === "number" &&
              ci >= 0 &&
              ci < opts.length
            ) {
              const correctOption = opts[ci];
              // Fisher-Yates
              const shuffled = [...opts];
              for (let i = shuffled.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
              }
              const newCorrectIndex = shuffled.findIndex(
                (o) => o === correctOption,
              );
              qq.options = shuffled;
              qq.correctIndex = newCorrectIndex >= 0 ? newCorrectIndex : ci;
            }
          }
        }
      }

      if (withImages && (mode === "flashcards" || mode === "quiz")) {
        // Pega 3 conceitos das primeiras perguntas
        const items = (parsed as Record<string, unknown>)[
          mode === "flashcards" ? "cards" : "questions"
        ];
        const concepts: string[] = [];
        if (Array.isArray(items)) {
          for (const item of items.slice(0, 3)) {
            if (item && typeof item === "object") {
              const q = (item as Record<string, unknown>).question;
              if (typeof q === "string" && q.trim().length > 0) {
                concepts.push(q.trim().slice(0, 120));
              }
            }
          }
        }
        if (concepts.length > 0) {
          const origin = new URL(req.url).origin;
          const cookie = req.headers.get("cookie") ?? "";
          imageUrls = await callImageEndpoint(concepts, origin, cookie);
        }
      }

      // Mindmap sempre vem com uma imagem ilustrativa do tópico central
      // (gpt-image-1). O custo já está embutido no preço de 20 coins.
      if (mode === "mindmap") {
        const central = (parsed as { centralTopic?: unknown }).centralTopic;
        if (typeof central === "string" && central.trim().length > 0) {
          const origin = new URL(req.url).origin;
          const cookie = req.headers.get("cookie") ?? "";
          imageUrls = await callImageEndpoint(
            [central.trim().slice(0, 160)],
            origin,
            cookie,
          );
        }
      }
    }

    await logAiUsage({
      userId,
      endpoint: "generate",
      model: MODEL,
      inputTokens: resp.usage?.input_tokens ?? 0,
      outputTokens: resp.usage?.output_tokens ?? 0,
      coinsCharged: cost,
    });

    return Response.json({
      mode,
      content,
      imageUrls,
      coinsCharged: cost,
      balanceAfter: charge.balanceAfter,
    });
  } catch (err) {
    await refundOnFailure("api_failure");
    return Response.json(logAndSanitize("api/ai/generate", err), {
      status: 500,
    });
  }
}
