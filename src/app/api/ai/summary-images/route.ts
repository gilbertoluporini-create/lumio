/**
 * POST /api/ai/summary-images
 *
 * Pipeline SIMPLES (refatorado 2026-05-31):
 *
 * 1) Carrega summary do DB (lectureId OU documentId).
 * 2) Extrai até 3 seções H2 do markdown (## ...) com até 600 chars de corpo.
 * 3) Traduz os títulos pra inglês curto (1 chamada batch Haiku — cheap, melhora
 *    muito o resultado do modelo de imagem).
 * 4) Pra cada seção, monta UM prompt minimalista (zero wrappers complexos)
 *    pedindo "ilustração educacional do tema X com este contexto Y".
 * 5) Chama `chatgpt-image-latest` quality:"high" size:"1536x1024".
 * 6) Upload pro bucket `ai-images` + update do summary no DB + injeção do
 *    markdown via `injectImagesIntoMarkdown`.
 *
 * O QUE FOI REMOVIDO da versão anterior:
 *  - `extractVisualConcepts` via Haiku com prompt gigante de "diretor de arte"
 *  - `wrapPromptForPremiumEducationalImage` wrapper
 *  - Anchor literal + sectionTopicEn + sectionIndex inferidos
 *  - Suporte a `referenceImages` (PDF page screenshots via /v1/images/edits)
 *  - Fallback Imagen via /api/ai/generate-images
 *  - Distribuição uniforme forçada de sectionIndex
 *
 * Comportamento desejado: que a imagem saia parecida com o que o ChatGPT
 * geraria se o user mandasse o resumo cru e pedisse "ilustra isso".
 *
 * Body: { lectureId?: string, documentId?: string, count?: 1|2|3, userId?: string }
 * Response: { images: LectureSummaryImage[] }
 */

import { createMessage } from "@/lib/llm-fallback";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { getClientIp, limitOrThrow } from "@/lib/rate-limit";
import { checkDailyCostCap, dailyCapResponse } from "@/lib/cost-cap";
import { logAiUsage } from "@/lib/ai-usage";
import {
  generateImageOpenAI,
  isOpenAIImageConfigured,
} from "@/lib/openai-image";
import type { LectureSummary, LectureSummaryImage } from "@/lib/types";

const STORAGE_BUCKET = "ai-images";
const IMAGE_MODEL = "chatgpt-image-latest" as const;
const IMAGE_QUALITY = "high" as const;
const IMAGE_SIZE = "1536x1024" as const;
const SECTION_BODY_MAX_CHARS = 600;
const HAIKU_MODEL = "claude-haiku-4-5-20251001";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

/**
 * Extrai as primeiras N seções H2 do markdown: { title, body }.
 * `body` = primeiros SECTION_BODY_MAX_CHARS chars do conteúdo até o próximo `## ` (ou fim).
 */
function extractH2Sections(
  markdown: string,
  maxSections: number,
): Array<{ title: string; body: string }> {
  if (!markdown || maxSections < 1) return [];
  const re = /^##\s+(.+)$/gm;
  type Match = { title: string; start: number; end: number };
  const matches: Match[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(markdown)) !== null) {
    matches.push({
      title: m[1].trim(),
      start: m.index,
      end: m.index + m[0].length,
    });
  }
  const out: Array<{ title: string; body: string }> = [];
  for (let i = 0; i < matches.length && out.length < maxSections; i++) {
    const cur = matches[i];
    const next = matches[i + 1];
    const bodyRaw = markdown
      .slice(cur.end, next ? next.start : markdown.length)
      .trim();
    if (!cur.title) continue;
    out.push({
      title: cur.title,
      body: bodyRaw.slice(0, SECTION_BODY_MAX_CHARS),
    });
  }
  return out;
}

/**
 * Traduz N títulos pt-BR pra inglês curto técnico em UMA chamada Haiku.
 * Retorna array alinhado por índice. Se algo falhar, devolve o título original
 * (o modelo de imagem ainda entende pt-BR, só fica menos preciso).
 */
async function translateTitlesToEnglish(titles: string[]): Promise<string[]> {
  if (titles.length === 0) return [];
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey && !process.env.OPENAI_API_KEY) return titles;

  const numbered = titles.map((t, i) => `${i + 1}. ${t}`).join("\n");
  const sys =
    "You translate Brazilian Portuguese educational section titles into short technical English titles suitable for image generation prompts. Use standard medical/scientific terminology (Gray's Anatomy, Robbins, Guyton). Keep each translation to 3-8 words. Preserve Latin anatomical names as-is. Return ONLY a JSON array of strings, same length and order as input. No prose, no markdown.";
  try {
    const resp = await createMessage(
      {
        model: HAIKU_MODEL,
        max_tokens: 400,
        system: sys,
        messages: [
          {
            role: "user",
            content: `Translate these ${titles.length} titles to short technical English. Return JSON array only.\n\n${numbered}`,
          },
        ],
      },
      { anthropicKey },
    );
    const text = resp.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { text: string }).text)
      .join("\n")
      .trim();
    const cleaned = text
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();
    const arrMatch = cleaned.match(/\[[\s\S]*\]/);
    const parsed = JSON.parse(arrMatch ? arrMatch[0] : cleaned) as unknown;
    if (!Array.isArray(parsed)) return titles;
    return titles.map((orig, i) => {
      const t = parsed[i];
      return typeof t === "string" && t.trim().length > 0 ? t.trim() : orig;
    });
  } catch (err) {
    console.warn("[summary-images] translation failed, using pt-BR titles", err);
    return titles;
  }
}

/**
 * Monta o prompt minimalista — estilo "user pedindo ilustração pro ChatGPT".
 * Deliberadamente curto e sem regras complexas: o `chatgpt-image-latest` já
 * tem instruções de qualidade embutidas.
 */
function buildPrompt(opts: { titleEn: string; bodyPt: string }): string {
  return [
    `Generate an educational infographic that EXPLAINS the mechanism of: "${opts.titleEn}".`,
    ``,
    `The image must VISUALLY EXPLAIN how this concept works — show the actual process, sequence, relationship, or cause-effect described in the context below. NOT a decorative collage of random body parts. If the topic is a process, show the steps with arrows. If it's a relationship (A causes B), show both sides clearly connected. If it's a structure, show the structure labeled.`,
    ``,
    `Content context (Portuguese, for YOUR understanding — do NOT copy these sentences into the image):`,
    opts.bodyPt,
    ``,
    `Style: clean educational infographic, high-end Brazilian medical textbook figure. Use Portuguese (pt-BR) labels ONLY — 1-3 words each, 4-8 labels distributed across the figure. NO English. NO Latin (write "fígado" not "hepar", "coração" not "cor", "músculo" not "musculus"). DO NOT write full sentences or paragraphs.`,
    ``,
    `Spelling: ALL Portuguese words must be spelled CORRECTLY with accents. Common terms to spell well: gene, proteína, célula, núcleo, DNA, RNA, fenótipo, genótipo, alelo, cromossomo, mitocôndria, ribossomo, enzima, fígado, coração, músculo, rim, pulmão, neurônio, sangue, hormônio, anticorpo, antígeno.`,
    ``,
    `Avoid: generic body silhouettes unless the topic IS about whole-body anatomy. Avoid random organs if the concept is molecular/genetic. Pick relevant visuals.`,
    ``,
    `ANATOMICAL ACCURACY (critical): each label MUST point to the structure that ACTUALLY contains it. Examples: a "gene" label must point to DNA inside the nucleus (NOT to a mitochondrion); "ribossomo" must point to small dots on rough ER or in cytoplasm (NOT inside the nucleus); "mitocôndria" must point to the bean-shaped organelle with cristae; "RNA mensageiro" must point to a strand leaving the nucleus toward a ribosome; "proteína" must point to the ribosome output, not to the DNA. Cell membrane transporters (like NIS, GLUT, etc.) sit ON the membrane bilayer, not floating inside. Double-check every arrow before finalizing.`,
    ``,
    `Aspect: 1536x1024 landscape.`,
  ].join("\n");
}

/**
 * Injeta `![alt](url)` + caption inline no markdown, logo após o `## H2`
 * correspondente ao sectionIndex de cada imagem. Sem isso, /resumo renderiza
 * o markdown sem imagens inline (só galeria separada).
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

/**
 * Gera UMA imagem via OpenAI `chatgpt-image-latest` e faz upload pro
 * bucket `ai-images`. Retorna URL pública ou null se falhou.
 */
async function generateAndUploadOne(
  prompt: string,
  userId: string,
  indexHint: number,
): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  try {
    const gen = await generateImageOpenAI({
      prompt,
      model: IMAGE_MODEL,
      quality: IMAGE_QUALITY,
      size: IMAGE_SIZE,
      outputFormat: "webp",
      apiKey,
    });
    const buffer = Buffer.from(gen.b64, "base64");
    const key = `${userId}/${Date.now()}-${indexHint}-${Math.random()
      .toString(36)
      .slice(2, 8)}.webp`;
    const admin = createAdminClient();
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
}

export async function POST(req: Request) {
  // Trigger interno (worker do plano de estudos / cron) bypassa auth de sessão
  // usando CRON_SECRET no header `x-internal-key`. Pra esses casos o `userId`
  // é enviado no body (worker não tem cookie de sessão). Fluxo de usuário
  // normal continua passando cookie e cai no auth padrão.
  const internalKey = req.headers.get("x-internal-key");
  const expectedInternalKey = process.env.CRON_SECRET ?? "";
  const isInternalCall = Boolean(
    internalKey && expectedInternalKey && internalKey === expectedInternalKey,
  );

  if (!isInternalCall) {
    const ip = getClientIp(req);
    const limited = limitOrThrow(`summary-images:ip:${ip}`, 5, 60_000);
    if (limited) return limited;
  }

  const supabase = await createClient();

  let body: {
    lectureId?: string;
    documentId?: string;
    count?: number;
    userId?: string;
  };
  try {
    body = (await req.json()) as {
      lectureId?: string;
      documentId?: string;
      count?: number;
      userId?: string;
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

  if (!body.lectureId && !body.documentId) {
    return Response.json(
      { error: "lectureId ou documentId obrigatório." },
      { status: 400 },
    );
  }
  const useDocument = !body.lectureId && Boolean(body.documentId);
  const count = Math.max(1, Math.min(3, body.count ?? 3));

  // Em chamadas internas usamos admin client pras leituras (bypassa RLS
  // porque o worker autentica via CRON_SECRET, não via sessão de user).
  const readClient = isInternalCall ? createAdminClient() : supabase;

  let lectureSummary: LectureSummary | null = null;

  if (useDocument) {
    const { data: docRow, error: docErr } = await readClient
      .from("documents")
      .select("id")
      .eq("id", body.documentId)
      .eq("user_id", userId)
      .maybeSingle();
    if (docErr || !docRow) {
      return Response.json(
        { error: "Document não encontrado." },
        { status: 404 },
      );
    }
    const { data: sumRow } = await readClient
      .from("summaries")
      .select("content")
      .eq("document_id", body.documentId)
      .eq("user_id", userId)
      .maybeSingle();
    lectureSummary = (sumRow?.content as LectureSummary | null) ?? null;
  } else {
    const { data: lectureRow, error: lecErr } = await readClient
      .from("lectures")
      .select("id")
      .eq("id", body.lectureId)
      .eq("user_id", userId)
      .maybeSingle();
    if (lecErr || !lectureRow) {
      return Response.json(
        { error: "Lecture não encontrada." },
        { status: 404 },
      );
    }
    // order+limit pra robustez contra duplicatas históricas (vide
    // educational-summary/route.ts).
    const { data: sumRow } = await readClient
      .from("summaries")
      .select("content")
      .eq("lecture_id", body.lectureId)
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    lectureSummary = (sumRow?.content as LectureSummary | null) ?? null;
  }

  if (!lectureSummary?.generalSummary) {
    return Response.json(
      { error: "Summary ainda não foi gerado." },
      { status: 404 },
    );
  }

  if (!isOpenAIImageConfigured()) {
    return Response.json(
      { error: "OpenAI image generation não configurado." },
      { status: 503 },
    );
  }

  // 1) Extrair seções H2 do markdown (até `count`)
  const sections = extractH2Sections(lectureSummary.generalSummary, count);
  if (sections.length === 0) {
    return Response.json({ images: [] });
  }

  // 2) Traduzir TODOS os títulos em UMA chamada Haiku (cheap, melhora o resultado)
  const titlesEn = await translateTitlesToEnglish(
    sections.map((s) => s.title),
  );

  // 3) Montar os prompts minimalistas (estilo ChatGPT direto)
  const prompts = sections.map((s, i) =>
    buildPrompt({ titleEn: titlesEn[i] ?? s.title, bodyPt: s.body }),
  );

  // 4) Gerar todas as imagens em paralelo
  const urlsAligned = await Promise.all(
    prompts.map((p, i) => generateAndUploadOne(p, userId, i)),
  );

  // 5) Log de telemetria (1 entrada agregada com imagesCount = N geradas com sucesso)
  const okCount = urlsAligned.filter(Boolean).length;
  if (okCount > 0) {
    try {
      await logAiUsage({
        userId,
        endpoint: "summary-images",
        // Nome composto pra bater a entrada landscape no PRICING table
        model: `${IMAGE_MODEL}-landscape`,
        imagesCount: okCount,
      });
    } catch {
      /* telemetria não pode quebrar fluxo */
    }
  }

  // 6) Combina URLs + captions/alt/sectionIndex (1:1 com seções)
  const images: LectureSummaryImage[] = [];
  sections.forEach((s, i) => {
    const url = urlsAligned[i];
    if (!url) return;
    images.push({
      url,
      alt: s.title,
      // Caption simples — primeira linha do corpo (ou título se vazio)
      caption: s.title,
      sectionIndex: i,
    });
  });

  if (images.length === 0) {
    return Response.json({ images: [] });
  }

  // 7) Salvar em summaries (source of truth) — markdown com imagens inline
  const markdownWithImages = injectImagesIntoMarkdown(
    lectureSummary.generalSummary ?? "",
    images,
  );
  const updatedSummary: LectureSummary = {
    ...lectureSummary,
    images,
    generalSummary: markdownWithImages,
  };
  const updateClient = isInternalCall ? createAdminClient() : supabase;
  const updateQ = updateClient
    .from("summaries")
    .update({ content: updatedSummary, images })
    .eq("user_id", userId);
  if (useDocument) {
    await updateQ.eq("document_id", body.documentId);
  } else {
    await updateQ.eq("lecture_id", body.lectureId);
  }

  // 8) Espelhar em lectures.summary_educational (mantém /lecture e /resumo
  // consistentes). Só pro caminho lecture — PDF puro não tem lectures row.
  if (!useDocument) {
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
      console.warn(
        "[summary-images] mirror to lectures.summary_educational failed",
        err,
      );
    }
  }

  return Response.json({ images });
}
