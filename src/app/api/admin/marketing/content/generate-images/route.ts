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
const BRAND_ANCHOR = `
========== LUMIO MASCOT — STRICT VISUAL FIDELITY ==========

You have 5 REFERENCE IMAGES of the Lumi mascot. The output MUST be visually consistent with the EXACT character in those refs. Study them carefully — this is a SPECIFIC custom mascot, not a generic cute 3D character.

==================== LUMI'S EXACT FACE (most important) ====================

Eyes — THIS IS THE #1 THING TO GET RIGHT:
- SMALL, narrow lavender SHAPES — NOT large round anime eyes
- Shape: like an upside-down letter "D" or a thin sleeping crescent / closed-eye gesture
- Solid uniform lavender color (#a78bfa to #b599f5) — flat fill, NO gradient inside
- NO white reflection / NO glint / NO sparkle highlight in the eyes
- NO visible eyelashes — eyes are clean smooth curves
- NO eye whites / sclera visible — eyes are solid lavender shapes only
- Eyes look subtly closed-but-happy, peaceful, NOT excited or wide open
- Both eyes are equal-sized, gently curved, sitting low on the face

Mouth:
- Tiny gentle curved smile, single thin line
- NOT an open mouth, NOT teeth showing
- Subtle and minimal

Cheeks:
- BARELY visible pink blush, near invisible — just a whisper of warmth
- NOT rosy pronounced cheeks, NOT Disney baby cheeks

Expression overall:
- Serene, calm, content — like a wise companion
- NOT excited, NOT over-cheerful, NOT "kawaii aggressive"
- Subdued and dignified, not childish

==================== LUMI'S BODY ====================

Head (lampshade):
- Bell-shaped / dome-shaped cream-ivory color (#f5ebd6 to #fff8e7)
- Soft lilac purple top ring / cap (#a78bfa)
- Smooth surface, subtle volumetric shading

Neck:
- Articulated bronze/champagne-gold metallic stem
- 2-3 jointed segments, slightly weathered metallic finish
- Connects head to base

Base:
- Round cream-ivory disc base
- Single small lilac purple button on top

==================== STYLE ====================

Render: 3D stylized in the vein of modern Pixar / high-end Cinema 4D commercial work. Soft global illumination, gentle subsurface scattering on cream surfaces, mild ambient occlusion. NOT flat vector. NOT 2D illustration. NOT cel-shaded anime.

Lighting: soft 3-point with warm key from upper-left, lavender ambient fill, subtle rim. Mild dreamy mood. NO harsh shadows.

Background: smooth lavender-to-cream vertical gradient (#e9d5ff at top → #fdf4e8 at bottom) OR deep solid purple background (#6d28d9 to #4c1d95) for variety. Soft, clean, never noisy.

==================== SCENE ====================

- Lumi is the focal element, in a NEW pose/scene matching the user's prompt
- Lumi can be paired with: books (purple/magenta/amber covers), notebook, plain paper with abstract squiggle marks NEVER readable text, coffee mug, plant, headphones, hourglass, blank tablet/laptop, sticky notes, light bulb, simple sparkles
- NO human characters, NO students, NO hands, NO faces other than Lumi
- ONE Lumi per image — never multiple mascots

==================== STRICT FORBIDS ====================

Eyes — most common failure mode, AVOID:
- NO large round wide-open eyes (anime/Disney style)
- NO white sparkle/glint reflections inside eyes
- NO visible pupils with iris detail
- NO eyelashes drawn out
- NO eye whites
- NO oversized "cute baby" eye proportions

Other forbids:
- NO TEXT anywhere — no captions, no labels, no logos, no watermarks, no URLs
- NO readable handwriting on papers/notebooks (abstract scribble only)
- NO UI mockups, NO computer/phone screens with visible content
- NO real humans, NO Disney/Pixar copyrighted characters
- NO photorealism, NO oversaturation, NO neon, NO dark/scary moods
- NO modifications to Lumi's silhouette / proportions / face structure
- IGNORE text/typography visible in reference images — that's NOT part of the brand

Generate a NEW scene with the SAME Lumi character.
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
