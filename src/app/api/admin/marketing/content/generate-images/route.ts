/**
 * POST /api/admin/marketing/content/generate-images
 *
 * Gera 3 imagens (1024x1024, 1536x1024, 1024x1536) via gpt-image-1 a partir
 * de um prompt visual, e sobe pro Supabase Storage retornando URLs públicas.
 *
 * Por que 3 tamanhos diferentes:
 *  - 1024x1024 (1:1) → Instagram feed, FB Page
 *  - 1536x1024 (~3:2) → X (timeline), LinkedIn (perto de 1.91:1 nativo)
 *  - 1024x1536 (2:3) → IG Stories, TikTok thumbnail, Pinterest
 *
 * Body: { draft_id, prompt, brand_anchor? }
 * Resp: { images: { ratio_1x1, ratio_landscape, ratio_portrait } }
 *
 * Apenas admin.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/server";
import {
  editImageWithReferences,
  isOpenAIImageConfigured,
} from "@/lib/openai-image";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120; // gpt-image-1 high quality demora 30-60s

const BUCKET = "marketing-images";

/**
 * Imagens warmup usadas como referência permanente pra gpt-image-1 edits.
 * São 3 poses distintas do mascote Lumi pra OpenAI capturar identidade visual:
 *  - 01-lancamento.jpg: Lumi frontal, em pilha de livros (pose central)
 *  - 06-transcricao.jpg: Lumi de lado, com braço articulado (pose lateral)
 *  - 07-tudo-num-lugar.jpg: Lumi em cena rica, com mesa e objetos (composição)
 *
 * Trocar essas imagens só se a marca visual mudar.
 */
const REFERENCE_FILENAMES = [
  "01-lancamento.jpg",     // Lumi frontal, sobre livros (pose canônica)
  "04-motivacao.jpg",      // Lumi lendo livro (mostra olhos pequenos meia-lua corretos)
  "06-transcricao.jpg",    // Lumi lateral com braço (variação pose)
  "07-tudo-num-lugar.jpg", // Lumi em cena rica multi-objetos
  "10-anexe-pdf.jpg",      // Lumi expressão neutra serena
];

async function loadReferences(): Promise<
  Array<{ buffer: Buffer; filename: string }>
> {
  const base = path.join(process.cwd(), "public", "instagram", "lumi-posts");
  const refs = await Promise.all(
    REFERENCE_FILENAMES.map(async (filename) => {
      const buf = await fs.readFile(path.join(base, filename));
      return { buffer: buf, filename };
    }),
  );
  return refs;
}

/**
 * Brand anchor — instrui modelo a usar referências pra identidade visual
 * + descreve a CENA específica do post. NÃO descreve o Lumi (referências fazem isso).
 */
/**
 * Brand anchor incorporado do doc oficial Lumio/Lumi do founder
 * (lumio_modelo_imagens_api_posts.md). Source of truth visual.
 */
const BRAND_ANCHOR = `
========== LUMIO BRAND OFFICIAL STYLE (source of truth) ==========

Premium 3D editorial render for an education tech brand called Lumio. Match the exact character design shown in the 5 REFERENCE IMAGES provided.

LUMI (the mascot) — consistent character design:
- Small cute friendly desk lamp character
- Rounded dome / bell-shaped lamp shade head in warm cream color (#FAF8F5)
- Softly glowing warm bulb interior with purple inner glow (#7C3AED area)
- Face sits inside the illuminated shade opening
- Two big, rounded, symmetrical dark-purple eyes (#24123D / #4c1d95 tone) with small white highlights / reflections
- Tiny calm friendly smile (single thin curved line)
- Articulated bronze-metal neck with rounded segments (champagne/bronze/dark-gray tone)
- Circular cream-colored base with a small purple button on top
- NO extra arms, NO human hands, NO unnecessary limbs
- Lumi can tilt head/neck to express curiosity, attention, focus, or quiet joy
- NEVER place text, logo, or signature on Lumi's body or base

VISUAL STYLE:
- Premium 3D render, soft, editorial, Apple/Disney/Pixar-like polish but cleaner and educational
- Soft plastic-metal material (NOT clay-like "massinha" texture)
- Soft studio lighting
- Realistic soft shadows
- Clean background with lots of negative space for typography overlay
- Modern, welcoming, trustworthy atmosphere
- Educational minimalist props: notebook, sketchbook, pencil, books, post-its, headphones, coffee, calendar, microphone, audio waves, cards, PDF, flashcards

PALETTE (use these hex codes specifically):
- Primary purple: #7C3AED
- Fuchsia accent: #C026D3
- Warm cream: #FAF8F5
- Light lilac: #C4B5FD
- Dark graphite (for shadow / dark text shape): #24123D
- Support gold/beige: #E9C46A
Avoid colors outside this palette. Red ONLY for "recording/live" tiny dots.

COMPOSITION RULES:
- Leave generous empty negative space for text overlay to be added later
- Lumi typically positioned on right or center, with empty area on opposite side
- Clean, uncluttered layout
- ONE Lumi per image (never multiples)

================ STRICT FORBIDS (negative prompt) ================

AVOID at all cost: wrong eyes, crossed eyes, asymmetric eyes, distorted face, scary expression, extra limbs, extra arms, human hands, deformed lamp, broken neck, melted plastic, low quality, blurry, noisy, messy background, too childish, too feminine, excessive sparkles, excessive confetti, text on character, text on lamp base, logo on lamp base, unreadable text, misspelled words, watermark, signature, duplicated character, cropped face, cropped eyes, harsh shadow, overexposed, cluttered layout, generic cartoon, flat 2D, clay-like massinha texture.

NO TEXT anywhere in the image — no captions, no labels, no logos, no watermarks, no URLs, no readable handwriting on papers (abstract squiggle marks only).
IGNORE all text/typography visible in the reference images — that was added later in design tools, NOT part of the brand.

NO human characters, NO students, NO faces other than Lumi.

Generate a NEW scene featuring the EXACT same Lumi character from references.
`.trim();

async function ensureBucket(supabase: ReturnType<typeof createAdminClient>) {
  // Idempotente — se já existe, ignora erro
  try {
    const { data } = await supabase.storage.getBucket(BUCKET);
    if (data) return;
    await supabase.storage.createBucket(BUCKET, {
      public: true,
      allowedMimeTypes: ["image/png", "image/jpeg", "image/webp"],
      fileSizeLimit: 10 * 1024 * 1024,
    });
  } catch {
    // ignora
  }
}

async function uploadAndGetUrl(
  supabase: ReturnType<typeof createAdminClient>,
  pathInBucket: string,
  b64: string,
): Promise<string> {
  const buf = Buffer.from(b64, "base64");
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(pathInBucket, buf, {
      contentType: "image/png",
      upsert: true,
    });
  if (error) throw new Error(`upload falhou: ${error.message}`);

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(pathInBucket);
  return data.publicUrl;
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  if (!isOpenAIImageConfigured()) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY não configurada" },
      { status: 500 },
    );
  }

  const body = await req.json().catch(() => null);
  if (!body?.draft_id || !body?.prompt) {
    return NextResponse.json(
      { error: "draft_id e prompt obrigatórios" },
      { status: 400 },
    );
  }

  const draftId = String(body.draft_id);
  const prompt = String(body.prompt).slice(0, 4000);
  const fullPrompt = `SCENE TO GENERATE: ${prompt}\n\n${BRAND_ANCHOR}`;
  const apiKey = process.env.OPENAI_API_KEY as string;

  const supabase = createAdminClient();
  await ensureBucket(supabase);

  // Carrega referências do Lumi 1 vez (compartilhada entre os 3 ratios)
  let references: Array<{ buffer: Buffer; filename: string }>;
  try {
    references = await loadReferences();
  } catch (err) {
    const msg = err instanceof Error ? err.message : "ler refs";
    return NextResponse.json(
      { error: `falha ao carregar refs do Lumi: ${msg}` },
      { status: 500 },
    );
  }

  type Ratio = "1x1" | "landscape" | "portrait";
  const ratios: Array<{ ratio: Ratio; size: "1024x1024" | "1536x1024" | "1024x1536" }> = [
    { ratio: "1x1", size: "1024x1024" },
    { ratio: "landscape", size: "1536x1024" },
    { ratio: "portrait", size: "1024x1536" },
  ];

  try {
    // Gera as 3 em paralelo — cada uma usa as MESMAS referências do Lumi
    const results = await Promise.all(
      ratios.map(async ({ ratio, size }) => {
        const { b64, revisedPrompt } = await editImageWithReferences({
          prompt: fullPrompt,
          references,
          quality: "medium",
          size,
          apiKey,
        });
        const storagePath = `content-drafts/${draftId}/${ratio}-${Date.now()}.png`;
        const url = await uploadAndGetUrl(supabase, storagePath, b64);
        return {
          ratio,
          size,
          url,
          revised_prompt: revisedPrompt,
          generated_at: new Date().toISOString(),
        };
      }),
    );

    const images: Record<string, unknown> = {};
    for (const r of results) {
      images[`ratio_${r.ratio}`] = {
        url: r.url,
        size: r.size,
        revised_prompt: r.revised_prompt,
        generated_at: r.generated_at,
      };
    }

    // Salva no draft
    await supabase
      .from("content_drafts")
      .update({ images, generated_at: new Date().toISOString() })
      .eq("id", draftId);

    return NextResponse.json({ images });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "erro desconhecido";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
