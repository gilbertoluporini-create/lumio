/**
 * POST /api/ai/summary-images
 *
 * Dado um lectureId que já tem summary gerado, extrai 2-3 conceitos visuais
 * do markdown via Haiku, chama OpenAI GPT Image (com refs do PDF/slides quando
 * disponíveis) e salva as URLs em lecture.summary.images.
 *
 * Body: { lectureId: string, count?: 2|3|4,
 *         referenceImages?: Array<{ filename?: string, dataUrl?: string }> }
 * Response: { images: LectureSummaryImage[] }
 */

import { createMessage } from "@/lib/llm-fallback";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { getClientIp, limitOrThrow } from "@/lib/rate-limit";
import { checkDailyCostCap, dailyCapResponse } from "@/lib/cost-cap";
import { logAiUsage } from "@/lib/ai-usage";
import {
  DEFAULT_OPENAI_IMAGE_MODEL,
  editImageWithReferences,
  generateImageOpenAI,
  isOpenAIImageConfigured,
  wrapPromptForPremiumEducationalImage,
} from "@/lib/openai-image";
import type { LectureSummary, LectureSummaryImage } from "@/lib/types";

const STORAGE_BUCKET = "ai-images";

/**
 * Converte dataURL (base64) em buffer pro endpoint /v1/images/edits.
 * Aceita JPEG/PNG/WebP. Retorna null se formato inválido.
 */
function dataUrlToReference(
  ref: { filename?: string; dataUrl?: string },
): { buffer: Buffer; filename: string } | null {
  if (!ref.dataUrl || typeof ref.dataUrl !== "string") return null;
  const match = ref.dataUrl.match(
    /^data:image\/(?:jpeg|jpg|png|webp);base64,(.+)$/i,
  );
  if (!match) return null;
  return {
    buffer: Buffer.from(match[1], "base64"),
    filename: ref.filename?.slice(0, 120) || "pdf-page.jpg",
  };
}

/**
 * Gera N imagens via OpenAI GPT Image e faz upload pro bucket `ai-images`.
 * Roda em paralelo; falhas individuais viram null. Retorna array ALINHADO
 * com `prompts` (mesmo índice) pra preservar a associação conceito↔imagem.
 * Se `referenceImages` vier preenchido, usa /v1/images/edits (modo "AI vê o
 * PDF"); senão, usa /v1/images/generations puro.
 */
async function generateAndUploadViaOpenAI(
  prompts: string[],
  userId: string,
  referenceImages: Array<{ filename?: string; dataUrl?: string }> = [],
): Promise<(string | null)[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return prompts.map(() => null);
  const admin = createAdminClient();

  // Pre-decode as referências uma vez (vai pra todos os prompts)
  const references = referenceImages
    .map(dataUrlToReference)
    .filter((r): r is { buffer: Buffer; filename: string } => r !== null)
    .slice(0, 16);

  const results = await Promise.all(
    prompts.map(async (prompt, i) => {
      try {
        let b64: string;
        if (references.length > 0) {
          const wrapped = wrapPromptForPremiumEducationalImage(prompt);
          const edit = await editImageWithReferences({
            prompt: [
              wrapped,
              "",
              "Use the attached PDF page screenshots as visual/source references. Preserve the relevant subject matter, terminology, diagrams, tables, and visual context from those pages, but create a clean new educational image rather than copying the page.",
            ].join("\n"),
            references,
            quality: "medium",
            size: "1536x1024",
            outputFormat: "webp",
            apiKey,
          });
          b64 = edit.b64;
        } else {
          const gen = await generateImageOpenAI({
            prompt: wrapPromptForPremiumEducationalImage(prompt),
            quality: "medium",
            size: "1536x1024",
            outputFormat: "webp",
            apiKey,
          });
          b64 = gen.b64;
        }
        const buffer = Buffer.from(b64, "base64");
        const key = `${userId}/${Date.now()}-${i}-${Math.random()
          .toString(36)
          .slice(2, 8)}.webp`;
        const { error: upErr } = await admin.storage
          .from(STORAGE_BUCKET)
          .upload(key, buffer, {
            contentType: "image/webp",
            upsert: false,
          });
        if (upErr) {
          console.error("[summary-images] upload failed", upErr);
          return null;
        }
        const { data: pub } = admin.storage
          .from(STORAGE_BUCKET)
          .getPublicUrl(key);
        return pub?.publicUrl ?? null;
      } catch (err) {
        console.error("[summary-images] openai image failed", err);
        return null;
      }
    }),
  );

  const okCount = results.filter(Boolean).length;
  if (okCount > 0) {
    try {
      await logAiUsage({
        userId,
        endpoint: "summary-images",
        model: DEFAULT_OPENAI_IMAGE_MODEL,
        imagesCount: okCount,
      });
    } catch {
      /* ignora — telemetria não pode quebrar fluxo */
    }
  }
  return results;
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

const HAIKU_MODEL = "claude-haiku-4-5-20251001";

type ConceptExtraction = {
  concepts: Array<{
    title: string;
    /** Trecho literal do resumo que a imagem ilustra — usado pra garantir
     *  que a cena gerada bate com o que está escrito naquela seção. */
    anchor?: string;
    prompt: string;
    caption?: string;
    sectionIndex?: number | null;
  }>;
};

type SourceContext = {
  lectureTitle: string;
  subjectName: string;
  markdown: string;
  transcript?: string;
  slidesText?: string;
  sections: Array<{ index: number; title: string }>;
  count: number;
};

/**
 * Extrai títulos das seções `## ` do markdown como fallback quando o summary
 * não tem `sections[]` estruturado.
 */
function sectionTitlesFromMarkdown(
  markdown: string,
): Array<{ index: number; title: string }> {
  const titles: Array<{ index: number; title: string }> = [];
  const re = /^##\s+(.+)$/gm;
  let match: RegExpExecArray | null;
  while ((match = re.exec(markdown)) !== null) {
    const title = match[1]
      .replace(/^\d+\.\s*/, "")
      .replace(/^Pontos-chave.*/i, "")
      .replace(/^Aplicação cl[ií]nica.*/i, "")
      .trim();
    if (title) titles.push({ index: titles.length, title });
  }
  return titles;
}

/**
 * Injeta `![alt](url)` + caption inline no markdown, logo após o `## H2`
 * correspondente ao sectionIndex de cada imagem. Sem isso, /resumo renderiza
 * o markdown sem imagens (só a galeria separada do SummaryImagesBlock).
 * Imagens sem sectionIndex válido viram galeria no final.
 */
function injectImagesIntoMarkdown(
  markdown: string,
  images: LectureSummaryImage[],
): string {
  if (!images || images.length === 0) return markdown;
  const lines = markdown.split("\n");
  const h2Indexes = lines
    .map((line, index) => ({ line, index }))
    .filter((item) => item.line.startsWith("## "));

  let offset = 0;
  const used = new Set<number>();
  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    if (typeof img.sectionIndex !== "number") continue;
    const target = h2Indexes[img.sectionIndex];
    if (!target) continue;
    const insertAt = target.index + 1 + offset;
    const insertLines = [
      "",
      `![${img.alt || img.caption || "Ilustração"}](${img.url})`,
    ];
    if (img.caption) insertLines.push(`*${img.caption}*`);
    insertLines.push("");
    lines.splice(insertAt, 0, ...insertLines);
    offset += insertLines.length;
    used.add(i);
  }

  // Sem sectionIndex válido: galeria no final do markdown
  const leftovers = images.filter((_, i) => !used.has(i));
  if (leftovers.length > 0) {
    lines.push("", "---", "");
    for (const img of leftovers) {
      lines.push(
        `![${img.alt || img.caption || "Ilustração"}](${img.url})`,
        img.caption ? `*${img.caption}*` : "",
        "",
      );
    }
  }
  return lines.join("\n");
}

async function extractVisualConcepts(
  ctx: SourceContext,
): Promise<ConceptExtraction> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey && !process.env.OPENAI_API_KEY) return { concepts: [] };

  // Monta bloco de fontes com prioridade: summary > transcript > slides
  const sources: string[] = [];
  sources.push(`# RESUMO GERADO\n${ctx.markdown.slice(0, 5000)}`);
  if (ctx.transcript && ctx.transcript.trim().length > 80) {
    sources.push(`# TRANSCRIÇÃO DA AULA\n${ctx.transcript.slice(0, 4000)}`);
  }
  if (ctx.slidesText && ctx.slidesText.trim().length > 80) {
    sources.push(`# SLIDES DO PROFESSOR\n${ctx.slidesText.slice(0, 4000)}`);
  }

  const sectionsList =
    ctx.sections.length > 0
      ? ctx.sections.map((s) => `${s.index}: ${s.title}`).join("\n")
      : "(o resumo não tem seções nomeadas)";

  const sys = `Você é um diretor de arte didático. Sua tarefa: ler o RESUMO da aula (markdown) abaixo e gerar ${ctx.count} pedidos de imagem que ILUSTRAM EXATAMENTE o que o resumo está explicando — não conceitos gerais da matéria, mas o conteúdo específico daquela seção.

PROCESSO OBRIGATÓRIO pra cada uma das ${ctx.count} imagens:
1. ESCOLHA uma seção diferente do resumo (sectionIndex). Distribua entre seções diferentes — nunca duas na mesma.
2. LEIA o parágrafo dessa seção com cuidado. Identifique o conceito CONCRETO que ela descreve (uma estrutura, um processo passo-a-passo, uma comparação, uma via metabólica, etc).
3. EXTRAIA o trecho-âncora literal — uma frase curta DO RESUMO (15-30 palavras) que descreve o que será visualizado. Esse trecho é a verdade-base: a cena pedida tem que representar literalmente esse trecho.
4. ESCREVA o prompt da imagem em inglês (70-130 palavras), descrevendo a cena que representa o trecho-âncora, usando os termos técnicos EXATOS que aparecem no resumo (estruturas, etapas, números, nomes). Deixe o estilo visual aberto — peça "high-quality educational illustration" e deixe o modelo escolher o melhor idioma visual pro conteúdo (flat editorial, semi-3D, isométrico, esquemático). NÃO trave em flat 2D bege se o conteúdo pede outra coisa.

REGRA DE FIDELIDADE (a mais importante):
- Se a seção fala "ciclo da ureia tem 5 etapas: carbamoil-fosfato → citrulina → argininossuccinato → arginina → ornitina", o prompt deve descrever EXATAMENTE essas 5 etapas nessa ordem. Não invente etapa 6.
- Se a seção fala de eixo hipotálamo-hipófise-tireoide com feedback negativo, NÃO desenhe uma tireoide solta sem o eixo.
- Se você não consegue extrair um trecho-âncora claro de uma seção, escolha outra seção. Melhor menos imagens fiéis do que mais imagens descoladas.

LABELS NA IMAGEM (regra apertada — texto em imagem IA quase sempre vira lixo):
- DEFAULT: NÃO peça labels. Peça uma cena que comunique tudo visualmente (cor, posição, setas, formas, ícones anatômicos).
- SÓ peça label se a estrutura for indistinguível sem ele (ex: dois hormônios idênticos onde um é FSH e outro LH). Mesmo aí: máx 2 labels, 1 palavra cada.
- Abreviações universais OK quando essenciais: DNA, RNA, ATP, NH3, H2O, CO2, pH, ECG, ALT, AST, nomes latinos anatômicos.
- PROIBIDO no prompt: pedir "with labeled diagram", "annotated", "with captions", frases pt-BR com acento (ã/ç/ó/é/ê), legendas, títulos dentro da imagem, parágrafos, balões de fala, bandeiras, qualquer texto em espanhol.
- Em vez de "labeled hypothalamus, pituitary, gonads" prefira "anatomically positioned hypothalamus above pituitary connected by stalk, gonads below — distinguished by color, no labels".

EVITE SEMPRE: estética exagerada/futurista, "student studying", livros genéricos, laptop, pessoa olhando tela, ícones soltos, stock photo, mascote, collage sem hierarquia, texto longo, parágrafos, balões de fala, bandeiras. Em temas médicos/biológicos, NÃO mostre fluidos corporais caindo em copos, tubos, beakers ou recipientes; represente excreção/transporte de forma limpa e esquemática com setas, vias anatômicas e ícones.

SEÇÕES DO RESUMO (você DEVE escolher uma destas):
${sectionsList}

TEMA: "${ctx.lectureTitle}" — Matéria: ${ctx.subjectName}

Retorne APENAS JSON puro (sem markdown, sem cercas):
{
  "concepts": [
    {
      "title": "Curto em pt-BR (3-6 palavras)",
      "anchor": "Trecho LITERAL do resumo (15-30 palavras) que a imagem ilustra. Copie tal qual aparece no markdown.",
      "prompt": "English scene description (70-130 words). Must visually represent the anchor sentence, using exact technical terms.",
      "caption": "Frase curta pt-BR (8-15 palavras) do que a imagem mostra — pode ser o anchor parafraseado.",
      "sectionIndex": <índice da seção (obrigatório, número válido)>
    }
  ]
}`;

  const resp = await createMessage(
    {
      model: HAIKU_MODEL,
      max_tokens: 1500,
      system: sys,
      messages: [
        {
          role: "user",
          content: `FONTES DA AULA:\n\n${sources.join("\n\n---\n\n")}\n\nGere ${ctx.count} conceitos visuais ancorados nessas fontes.`,
        },
      ],
    },
    { anthropicKey: apiKey },
  );

  const text =
    resp.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { text: string }).text)
      .join("\n")
      .trim() ?? "";

  const cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  try {
    return JSON.parse(cleaned) as ConceptExtraction;
  } catch {
    const fallbackMatch = cleaned.match(/\{[\s\S]*\}/);
    if (fallbackMatch) {
      try {
        return JSON.parse(fallbackMatch[0]) as ConceptExtraction;
      } catch {
        /* falha — devolve vazio */
      }
    }
    return { concepts: [] };
  }
}

export async function POST(req: Request) {
  // Trigger interno (worker do plano de estudos / cron) bypassa auth de
  // sessão usando CRON_SECRET no header `x-internal-key`. Pra esses casos
  // o `userId` é enviado no body (worker não tem cookie de sessão).
  // Fluxo normal de usuário (educational-summary, botão "Gerar ilustrações"
  // na /resumo, etc) continua passando cookie e cai no auth padrão.
  const internalKey = req.headers.get("x-internal-key");
  const expectedInternalKey = process.env.CRON_SECRET ?? "";
  const isInternalCall = Boolean(
    internalKey && expectedInternalKey && internalKey === expectedInternalKey,
  );

  // Rate-limit por IP só pra chamadas de usuário; internal já vem de cron
  // controlado e a frequência é limitada pelo próprio worker.
  if (!isInternalCall) {
    const ip = getClientIp(req);
    const limited = limitOrThrow(`summary-images:ip:${ip}`, 5, 60_000);
    if (limited) return limited;
  }

  const supabase = await createClient();

  let body: {
    lectureId?: string;
    count?: number;
    userId?: string;
    referenceImages?: Array<{ filename?: string; dataUrl?: string }>;
  };
  try {
    body = (await req.json()) as {
      lectureId?: string;
      count?: number;
      userId?: string;
      referenceImages?: Array<{ filename?: string; dataUrl?: string }>;
    };
  } catch {
    return Response.json({ error: "JSON inválido." }, { status: 400 });
  }

  let userId: string;
  if (isInternalCall) {
    if (!body.userId) {
      return Response.json(
        { error: "userId obrigatório em chamadas internas." },
        { status: 400 },
      );
    }
    userId = body.userId;
  } else {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return Response.json({ error: "Não autenticado." }, { status: 401 });
    }
    userId = user.id;
  }

  // Cap diário USD por user (anti-abuse). Admin/founder bypass.
  const cap = await checkDailyCostCap(userId);
  if (!cap.ok) return dailyCapResponse(cap);

  if (!body.lectureId) {
    return Response.json(
      { error: "lectureId obrigatório." },
      { status: 400 },
    );
  }
  const count = Math.max(2, Math.min(4, body.count ?? 3));

  // Em chamadas internas usamos admin client pras leituras (bypassa RLS
  // porque o worker autentica via CRON_SECRET, não via sessão de user).
  const readClient = isInternalCall ? createAdminClient() : supabase;

  // Carrega lecture com TODO contexto pra ancorar a geração:
  // transcript + slides + título + matéria. Summary vem de summaries table.
  const { data: lectureRow, error: lecErr } = await readClient
    .from("lectures")
    .select("id, title, subject_id, transcript, slides")
    .eq("id", body.lectureId)
    .eq("user_id", userId)
    .maybeSingle();
  if (lecErr || !lectureRow) {
    return Response.json({ error: "Lecture não encontrada." }, { status: 404 });
  }
  const { data: sumRow } = await readClient
    .from("summaries")
    .select("content")
    .eq("lecture_id", body.lectureId)
    .eq("user_id", userId)
    .maybeSingle();
  const lectureSummary = (sumRow?.content as LectureSummary | null) ?? null;
  if (!lectureSummary?.generalSummary) {
    return Response.json(
      { error: "Summary ainda não foi gerado." },
      { status: 404 },
    );
  }

  // Tenta puxar nome da matéria
  let subjectName = "Geral";
  if (lectureRow.subject_id) {
    const { data: subj } = await readClient
      .from("subjects")
      .select("name")
      .eq("id", lectureRow.subject_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (subj?.name) subjectName = subj.name as string;
  }

  // Serializa slides como texto
  type SlideRow = { pageNumber?: number; title?: string; text?: string };
  const slidesArr = (lectureRow.slides ?? []) as SlideRow[];
  const slidesText = Array.isArray(slidesArr)
    ? slidesArr
        .map(
          (s) =>
            `[Slide ${s.pageNumber ?? "?"}${s.title ? ` — ${s.title}` : ""}]\n${s.text ?? ""}`,
        )
        .join("\n\n")
    : "";

  // Seções numeradas pra o Haiku ancorar cada imagem na seção certa
  // (intercalação inline no resumo em vez de galeria agrupada).
  const sectionsForMap = (lectureSummary.sections ?? []).map((s, i) => ({
    index: i,
    title: s.slideTitle?.trim() || `Seção ${i + 1}`,
  }));
  const markdownSections = sectionTitlesFromMarkdown(
    lectureSummary.generalSummary,
  );

  // 1) Extrair conceitos ancorados no contexto completo
  const { concepts } = await extractVisualConcepts({
    lectureTitle: (lectureRow.title as string) ?? "Aula",
    subjectName,
    markdown: lectureSummary.generalSummary,
    transcript: (lectureRow.transcript as string | null) ?? undefined,
    slidesText,
    sections: sectionsForMap.length > 0 ? sectionsForMap : markdownSections,
    count,
  });
  if (!concepts || concepts.length === 0) {
    return Response.json({ images: [] });
  }

  // Distribuição uniforme FORÇADA das imagens ao longo do resumo.
  // Sem isso, quando o LLM concentra (ex: 0,1,2 num resumo de 5 seções),
  // o final fica vazio. Aqui geramos N posições igualmente espaçadas
  // (i+1)/(N+1) × totalSections — 3 imagens em 5 seções viram seções
  // [1, 2, 3] (espaçadas), não [0,1,2]. Respeita a escolha do LLM só
  // quando ela está a no máximo 1 seção de distância da ideal.
  const totalSections =
    sectionsForMap.length > 0 ? sectionsForMap.length : markdownSections.length;
  if (totalSections > 1) {
    const idealPositions = concepts.map((_, i) =>
      Math.round(((i + 1) * totalSections) / (concepts.length + 1)),
    );
    const seen = new Set<number>();
    concepts.forEach((c, i) => {
      let target = Math.min(totalSections - 1, Math.max(0, idealPositions[i]));
      const raw = c.sectionIndex;
      if (
        typeof raw === "number" &&
        raw >= 0 &&
        raw < totalSections &&
        Math.abs(raw - target) <= 1 &&
        !seen.has(raw)
      ) {
        target = raw;
      }
      // Resolve colisão andando pra frente
      let guard = 0;
      while (seen.has(target) && guard < totalSections) {
        target = (target + 1) % totalSections;
        guard++;
      }
      c.sectionIndex = target;
      seen.add(target);
    });
  }

  // 2) Blindagem: cada prompt enviado pro modelo de imagem leva o
  // trecho-âncora literal na frente, forçando a cena a representar
  // exatamente o que aquela seção do resumo diz.
  const promptsWithAnchor = concepts.map((c) => {
    const anchor = (c.anchor ?? "").trim();
    if (!anchor) return c.prompt;
    return [
      `MUST faithfully illustrate this exact passage from the lecture summary (do not deviate, do not generalize, do not add concepts not in this passage):`,
      `"${anchor}"`,
      ``,
      c.prompt,
    ].join("\n");
  });

  // 3) Geração de imagens — prefere OpenAI gpt-image. Retorno ALINHADO
  // com `concepts` (mesmo índice) pra preservar a associação conceito↔imagem↔seção.
  let urlsAligned: (string | null)[] = [];
  if (isOpenAIImageConfigured()) {
    urlsAligned = await generateAndUploadViaOpenAI(
      promptsWithAnchor,
      userId,
      Array.isArray(body.referenceImages) ? body.referenceImages : [],
    );
  }

  // Fallback Imagen quando OpenAI não configurado OU falhou completamente.
  // Em chamada interna do worker NÃO há cookie de sessão, então
  // `/api/ai/generate-images` (que valida auth via cookie) retornaria 401.
  // Nesse caso pulamos o fallback e devolvemos imagens vazias — o card de
  // resumo ainda aparece e user pode clicar "Gerar ilustrações" depois.
  if (!urlsAligned.some(Boolean) && !isInternalCall) {
    const origin = req.headers.get("x-forwarded-proto")
      ? `${req.headers.get("x-forwarded-proto")}://${req.headers.get("host")}`
      : `http://${req.headers.get("host")}`;
    const cookieHeader = req.headers.get("cookie") ?? "";

    const imagesResp = await fetch(`${origin}/api/ai/generate-images`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: cookieHeader,
      },
      body: JSON.stringify({
        prompts: promptsWithAnchor,
      }),
    });

    if (!imagesResp.ok) {
      const errText = await imagesResp.text().catch(() => "");
      console.error("[summary-images] generate-images failed", errText);
      return Response.json(
        { error: "Falha ao gerar imagens." },
        { status: 502 },
      );
    }
    const json = (await imagesResp.json()) as { urls?: string[] };
    const fbUrls = json.urls ?? [];
    urlsAligned = concepts.map((_, i) => fbUrls[i] ?? null);
  }

  // 4) Combinar URLs + captions/alts/sectionIndex, preservando o conceito.
  const images: LectureSummaryImage[] = [];
  concepts.forEach((c, i) => {
    const url = urlsAligned[i];
    if (!url) return;
    images.push({
      url,
      alt: c.title ?? `Ilustração ${i + 1}`,
      // Caption: anchor (trecho literal do resumo) > title se o LLM esqueceu.
      caption: c.caption ?? c.anchor ?? c.title,
      sectionIndex: typeof c.sectionIndex === "number" ? c.sectionIndex : null,
    });
  });

  if (images.length === 0) {
    return Response.json({ images: [] });
  }

  // 5) Salvar em summaries (source of truth) — markdown com imagens inline
  // injetadas após cada ## H2 correspondente. /resumo renderiza
  // generalSummary cru via ReactMarkdown, então sem isso as imagens só
  // aparecem na galeria separada (SummaryImagesBlock), nunca inline.
  const markdownWithImages = injectImagesIntoMarkdown(
    lectureSummary.generalSummary ?? "",
    images,
  );
  const updatedSummary: LectureSummary = {
    ...lectureSummary,
    images,
    generalSummary: markdownWithImages,
  };
  // Em chamada interna o admin client bypassa RLS; em chamada normal de
  // user o supabase autenticado já tem RLS pra impor user_id correto.
  await (isInternalCall ? createAdminClient() : supabase)
    .from("summaries")
    .update({ content: updatedSummary, images })
    .eq("lecture_id", body.lectureId)
    .eq("user_id", userId);

  // 6) Espelhar tudo em lectures.summary_educational — markdown injetado
  // E array de images. Sem isso:
  //  (a) se user deletar resumo na /resumos, a tela da aula perde imagens
  //  (b) o /lecture renderiza markdown sem inline (depende da prop summaryImages)
  // Mantendo o markdown atualizado, /lecture e /resumo ficam consistentes.
  try {
    const admin = createAdminClient();
    const { data: lecRow } = await admin
      .from("lectures")
      .select("summary_educational")
      .eq("id", body.lectureId)
      .maybeSingle();
    const existingEdu =
      (lecRow?.summary_educational as
        | { markdown?: string; generatedAt?: string; images?: unknown }
        | null) ?? null;
    if (existingEdu?.markdown) {
      const eduMarkdownWithImages = injectImagesIntoMarkdown(
        existingEdu.markdown,
        images,
      );
      await admin
        .from("lectures")
        .update({
          summary_educational: {
            ...existingEdu,
            markdown: eduMarkdownWithImages,
            images,
          },
        })
        .eq("id", body.lectureId);
    }
  } catch (err) {
    console.warn("[summary-images] mirror to lectures.summary_educational failed", err);
  }

  return Response.json({ images });
}
