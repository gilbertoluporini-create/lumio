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

import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/server";
import {
  generateImageOpenAI,
  isOpenAIImageConfigured,
} from "@/lib/openai-image";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120; // gpt-image-1 high quality demora 30-60s

const BUCKET = "marketing-images";

/**
 * Brand anchor obrigatório no fim do prompt — mantém visual coerente
 * com a identidade Lumio. O mascote Lumi DEVE aparecer em todo post.
 *
 * Estilo: 3D render estilizado tipo Pixar/Cinema 4D, NÃO vetor flat.
 * Descrição do mascote vem das imagens originais em /public/instagram/lumi-posts/.
 */
const BRAND_ANCHOR = `
========== LUMIO BRAND VISUAL IDENTITY — STRICT RULES ==========

THE LUMI MASCOT (MUST appear in every image, centered or prominent):
A cute 3D-rendered cartoon desk lamp character named Lumi. Style: stylized 3D render in the visual language of Pixar / modern Cinema 4D animation. Soft global illumination, gentle subsurface scattering on the cream surfaces, subtle ambient occlusion. NOT flat vector, NOT 2D illustration — fully volumetric 3D render with depth.

Lumi's anatomy:
- A small friendly desk lamp with a personified face
- Bell-shaped lampshade head in warm cream / pale ivory color (#f5ebd6 to #fff8e7) with a soft lilac purple top ring
- Lumi's "face" sits inside the shade opening: two big rounded soft-lavender eyes (#c4b5fd) shaped like upside-down half-circles, a small subtle blush, and a gentle closed-mouth smile — childlike, kawaii, never creepy, never sad
- Articulated bronze/champagne-gold metallic arm in 2-3 jointed segments, slightly weathered, soft metallic shading
- Round cream base with a tiny lilac purple button on top
- Lumi is always cheerful, calm, helpful — a study companion vibe, not a salesperson

SCENE COMPOSITION RULES:
- Lumi is ALWAYS present and is the focal element
- NO human characters, NO students, NO people, NO hands. Only Lumi + objects.
- Lumi can be paired with educational props: stacked books (purple, magenta, amber covers), an open notebook, a coffee mug, a tablet/laptop with blank screen, sticky notes, paper sheets with abstract writing scribbles (never readable text), a tiny plant, headphones, a microphone
- Books, when stacked, follow Lumio palette: deep purple #6d28d9, magenta #db2777, warm amber #d97706
- Floating decorative elements OK: small stars (✦), sparkles, lightbulb icons — all in lavender tones

BACKGROUND & PALETTE:
- Background: smooth lavender-to-cream vertical gradient (#e9d5ff at top, #faf5ff/#fdf4e8 at bottom). Soft, no texture noise.
- Optional subtle window-light cast from the side
- Strict palette: lavender purples (#a78bfa, #c4b5fd, #ddd6fe, #ede9fe), cream (#fdf4e8, #fff8e7), magenta/pink accents (#db2777, #f472b6) ONLY where books/objects justify it
- NO black, NO neon, NO oversaturation, NO photorealistic textures

ABSOLUTELY FORBIDDEN:
- NO TEXT of any kind (no captions, no labels, no logos, no watermarks, no website URLs, no LumioApp.net stamp — text is added later in design tool)
- NO website screenshots, NO UI mockups, NO phone/computer screens with visible content
- NO faces of real humans, NO Disney characters, NO copyrighted mascots
- NO multiple Lumi mascots (only ONE Lumi per image)
- NO scary, dark, melancholic moods — always warm, friendly, hopeful
- NO photography/photorealism — must remain stylized 3D render

LIGHTING & RENDER:
- Soft 3-point lighting with key from upper-left, lavender ambient
- Mild bloom on Lumi's eyes for a glowy "alive" feel
- Shallow depth of field, gentle background blur if scene allows
- Clean focused composition with breathing room

This is the EXACT brand. Generate accordingly.
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
  const fullPrompt = `${prompt}\n\n${BRAND_ANCHOR}`;
  const apiKey = process.env.OPENAI_API_KEY as string;

  const supabase = createAdminClient();
  await ensureBucket(supabase);

  type Ratio = "1x1" | "landscape" | "portrait";
  const ratios: Array<{ ratio: Ratio; size: "1024x1024" | "1536x1024" | "1024x1536" }> = [
    { ratio: "1x1", size: "1024x1024" },
    { ratio: "landscape", size: "1536x1024" },
    { ratio: "portrait", size: "1024x1536" },
  ];

  try {
    // Gera as 3 em paralelo
    const results = await Promise.all(
      ratios.map(async ({ ratio, size }) => {
        const { b64, revisedPrompt } = await generateImageOpenAI({
          prompt: fullPrompt,
          quality: "medium",
          size,
          apiKey,
        });
        const path = `content-drafts/${draftId}/${ratio}-${Date.now()}.png`;
        const url = await uploadAndGetUrl(supabase, path, b64);
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
