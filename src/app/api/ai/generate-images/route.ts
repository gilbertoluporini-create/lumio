/**
 * POST /api/ai/generate-images
 *
 * Gera 1-4 imagens educacionais via OpenAI `chatgpt-image-latest`
 * (quality:"high", size:"1536x1024" landscape) e faz upload pro bucket
 * `ai-images` do Supabase Storage.
 *
 * Histórico (2026-05-31): refatorado pra MESMA estratégia minimalista de
 * `/api/ai/summary-images` — antes usava Google Imagen 4 com `wrapPrompt`
 * elaborado pedindo "infográfico com seções numeradas 1. GENÁTIPO 2.
 * FENÁTIPO", o que produzia texto corrompido (Imagen é fraco com
 * tipografia pt-BR). `chatgpt-image-latest` gera texto legível e respeita
 * melhor a instrução "minimize texto".
 *
 * Body: { prompts: string[] }      // max 4
 * Response: { urls: string[] }     // mantém compat com /api/ai/generate
 *
 * NÃO debita coins aqui — `/api/ai/generate` orquestra o pricing global
 * e chama essa rota internamente quando `withImages=true`.
 *
 * Fluxo:
 *  1) Auth + rate-limit + cost cap
 *  2) (Opcional) traduz cada prompt pt-BR pra título técnico EN curto via
 *     UMA chamada Haiku batch (cheap, melhora qualidade do modelo de imagem)
 *  3) Monta prompt minimalista (~7 linhas, sem regras de layout)
 *  4) Chama `chatgpt-image-latest` em paralelo (fallback automático pra
 *     `gpt-image-1` se a org não tiver acesso ao latest)
 *  5) Upload pro bucket + retorna URLs públicas
 *  6) Telemetria: `chatgpt-image-latest-landscape` no logAiUsage
 */

import { logAndSanitize } from "@/lib/api-security";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { getClientIp, limitOrThrow } from "@/lib/rate-limit";
import { logAiUsage } from "@/lib/ai-usage";
import { checkDailyCostCap, dailyCapResponse } from "@/lib/cost-cap";
import { isFeatureEnabled, featureDisabledResponse } from "@/lib/feature-flags";
import {
  generateImageOpenAI,
  isOpenAIImageConfigured,
} from "@/lib/openai-image";
import { createMessage } from "@/lib/llm-fallback";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

const BUCKET = "ai-images";
const MAX_PROMPTS = 4;
const IMAGE_MODEL = "chatgpt-image-latest" as const;
const IMAGE_QUALITY = "high" as const;
const IMAGE_SIZE = "1536x1024" as const;
const RAW_PROMPT_MAX_CHARS = 600;
const HAIKU_MODEL = "claude-haiku-4-5-20251001";

type Body = {
  prompts: string[];
};

/**
 * Traduz N hints pt-BR pra títulos técnicos EN curtos em UMA chamada
 * Haiku batch. Retorna array alinhado por índice. Se falhar, devolve os
 * originais (o `chatgpt-image-latest` ainda entende pt-BR, só fica menos
 * preciso em terminologia médica/anatômica).
 *
 * Mesmo padrão usado em `/api/ai/summary-images`.
 */
async function translateHintsToEnglish(hints: string[]): Promise<string[]> {
  if (hints.length === 0) return [];
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey && !process.env.OPENAI_API_KEY) return hints;

  // Usa só os primeiros ~120 chars de cada hint pro título — evita estourar
  // tokens e foca o tradutor no "tema" não no corpo inteiro.
  const numbered = hints
    .map((t, i) => `${i + 1}. ${t.slice(0, 120)}`)
    .join("\n");
  const sys =
    "You translate Brazilian Portuguese educational concept descriptions into short technical English titles suitable for image generation prompts. Use standard medical/scientific terminology (Gray's Anatomy, Robbins, Guyton). Keep each translation to 3-8 words. Preserve Latin anatomical names as-is. Return ONLY a JSON array of strings, same length and order as input. No prose, no markdown.";
  try {
    const resp = await createMessage(
      {
        model: HAIKU_MODEL,
        max_tokens: 400,
        system: sys,
        messages: [
          {
            role: "user",
            content: `Translate these ${hints.length} concepts to short technical English titles. Return JSON array only.\n\n${numbered}`,
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
    if (!Array.isArray(parsed)) return hints;
    return hints.map((orig, i) => {
      const t = parsed[i];
      return typeof t === "string" && t.trim().length > 0 ? t.trim() : orig;
    });
  } catch (err) {
    console.warn(
      "[generate-images] translation failed, using pt-BR hints",
      err,
    );
    return hints;
  }
}

/**
 * Monta prompt minimalista — estilo "user pedindo ilustração pro ChatGPT".
 * Deliberadamente curto: o `chatgpt-image-latest` já tem instruções de
 * qualidade embutidas e respeita "minimize text" melhor que Imagen 4.
 *
 * Estratégia: traduzir o tema pro EN (título curto técnico) e passar o
 * corpo pt-BR como CONTEXTO (não como texto pra estampar na imagem).
 */
function buildPrompt(opts: { titleEn: string; bodyPt: string }): string {
  const trimmedBody = opts.bodyPt.trim().slice(0, RAW_PROMPT_MAX_CHARS);
  return [
    `Generate a high-quality educational illustration showing: "${opts.titleEn}".`,
    ``,
    `Content context (Portuguese, for understanding only — do NOT include this text in the image):`,
    trimmedBody,
    ``,
    `Style: clean modern educational illustration, like a high-end medical textbook figure. Visual-first — minimize text, prefer arrows, anatomical drawings, color coding, schematic flows. If you must use a label, use English (3 words max) or Latin. No Portuguese text. Aspect: 1536x1024 landscape.`,
  ].join("\n");
}

async function ensureBucket(
  admin: ReturnType<typeof createAdminClient>,
): Promise<void> {
  try {
    const { data } = await admin.storage.getBucket(BUCKET);
    if (data) return;
  } catch {
    // segue pro create
  }
  try {
    await admin.storage.createBucket(BUCKET, {
      public: true,
      fileSizeLimit: "10MB",
    });
  } catch (err) {
    // Outra request criou em paralelo — ignora se já existe
    console.warn("[generate-images] createBucket warn", err);
  }
}

/**
 * Gera UMA imagem via OpenAI `chatgpt-image-latest` e faz upload pro
 * bucket `ai-images`. Retorna URL pública ou null se falhou.
 */
async function generateAndUploadOne(
  prompt: string,
  userId: string,
  indexHint: number,
  apiKey: string,
  admin: ReturnType<typeof createAdminClient>,
): Promise<string | null> {
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
    const { error: upErr } = await admin.storage
      .from(BUCKET)
      .upload(key, buffer, {
        contentType: "image/webp",
        upsert: false,
      });
    if (upErr) {
      console.error("[generate-images] upload failed", upErr);
      return null;
    }
    const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(key);
    return pub?.publicUrl ?? null;
  } catch (err) {
    console.error("[generate-images] openai image failed", err);
    return null;
  }
}

export async function POST(req: Request) {
  const ip = getClientIp(req);
  const ipLimit = limitOrThrow(`ai-images:ip:${ip}`, 5, 60_000);
  if (ipLimit) return ipLimit;

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
  const userLimit = limitOrThrow(`ai-images:user:${userId}`, 10, 60_000);
  if (userLimit) return userLimit;

  // Kill-switch global de imagens. Mantém a chave `features.imagen.enabled`
  // por compat com o painel admin (semanticamente cobre "geração de imagens",
  // independente do provider — antes Imagen 4, agora chatgpt-image-latest).
  if (!(await isFeatureEnabled("features.imagen.enabled"))) {
    return featureDisabledResponse("features.imagen.enabled");
  }

  // Cap diário USD (anti-abuse). Agora ainda mais relevante:
  // chatgpt-image-latest high = ~$0.167/img vs Imagen 4 = ~$0.04/img.
  // 4 imagens no fluxo "Criar resumo com imagens" = ~$0.67/geração.
  const cap = await checkDailyCostCap(userId);
  if (!cap.ok) return dailyCapResponse(cap);

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return Response.json({ error: "JSON inválido." }, { status: 400 });
  }

  const prompts = Array.isArray(body.prompts) ? body.prompts : [];
  const valid = prompts
    .filter((p): p is string => typeof p === "string" && p.trim().length > 0)
    .slice(0, MAX_PROMPTS);

  if (valid.length === 0) {
    return Response.json(
      { error: "Forneça pelo menos um prompt." },
      { status: 400 },
    );
  }

  if (!isOpenAIImageConfigured()) {
    return Response.json(
      {
        error:
          "Imagens AI temporariamente indisponíveis — admin precisa configurar OPENAI_API_KEY.",
        urls: [],
      },
      { status: 503 },
    );
  }
  const apiKey = process.env.OPENAI_API_KEY as string;

  try {
    const admin = createAdminClient();
    await ensureBucket(admin);

    // 1) Traduz hints pt-BR → títulos técnicos EN (UMA call Haiku batch)
    const titlesEn = await translateHintsToEnglish(valid);

    // 2) Monta os prompts minimalistas
    const finalPrompts = valid.map((rawPt, i) =>
      buildPrompt({ titleEn: titlesEn[i] ?? rawPt, bodyPt: rawPt }),
    );

    // 3) Gera em paralelo (chatgpt-image-latest é lento, ~10-20s cada)
    const urlsAligned = await Promise.all(
      finalPrompts.map((p, i) =>
        generateAndUploadOne(p, userId, i, apiKey, admin),
      ),
    );

    const urls: string[] = urlsAligned.filter(
      (u): u is string => typeof u === "string" && u.length > 0,
    );

    if (urls.length > 0) {
      try {
        await logAiUsage({
          userId,
          endpoint: "generate-images",
          // Nome composto bate a entrada landscape na tabela de PRICING
          // (ai-usage.ts: "chatgpt-image-latest-landscape" = $0.167/img).
          model: `${IMAGE_MODEL}-landscape`,
          imagesCount: urls.length,
        });
      } catch {
        /* telemetria não pode quebrar fluxo */
      }
    }

    return Response.json({ urls });
  } catch (err) {
    return Response.json(logAndSanitize("api/ai/generate-images", err), {
      status: 500,
    });
  }
}
