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
  "01-lancamento.jpg",
  "06-transcricao.jpg",
  "07-tudo-num-lugar.jpg",
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
========== LUMIO BRAND — REFERENCE-DRIVEN GENERATION ==========

You have been given REFERENCE IMAGES of the Lumi mascot. The mascot in every output image MUST match the references EXACTLY in:
- Character shape (bell-shaped lamp head, articulated bronze arm, cream base with lilac button)
- Color palette of Lumi itself (cream/ivory shade, soft lavender eyes, champagne-bronze arm, lilac purple accents)
- Eye shape and friendly expression (kawaii rounded eyes, gentle smile, subtle blush)
- 3D Pixar-style rendering quality (volumetric, soft lighting, NOT flat vector)

CRITICAL: IGNORE all text, headlines, captions, UI elements, website stamps visible in the reference images. Those are NOT part of the brand — they were added later in design tools. The OUTPUT IMAGE MUST CONTAIN ZERO TEXT.

SCENE COMPOSITION:
- Lumi is the focal element of every image, in a new pose/scene matching the user's prompt
- NO human characters, NO students, NO people, NO hands. Only Lumi + objects.
- Educational props OK: stacked books (purple/magenta/amber covers like references), notebook, paper sheets with abstract scribble (NEVER readable), coffee mug, plant, headphones, hourglass, tablet/laptop with BLANK screen, sticky notes
- Background: smooth lavender-to-cream gradient like references (#e9d5ff to #fdf4e8) OR deeper purple (#6d28d9) for variety, both work
- Floating decorative elements OK: small sparkles, stars, lightbulb icons in lavender tones

ABSOLUTELY FORBIDDEN:
- NO TEXT of any kind anywhere in the image (no captions, no labels, no logos, no watermarks, no website URLs, no headlines)
- NO website screenshots, NO UI mockups, NO phone/computer screens with visible content
- NO faces of real humans, NO Disney/Pixar copyrighted characters, NO other mascots
- NO multiple Lumi mascots (ONE Lumi per image)
- NO scary, dark, melancholic moods — always warm, friendly, hopeful
- NO photography/photorealism — must remain stylized 3D render matching references
- NO modifications to Lumi's core anatomy — same lamp shape, same eye style, same proportions

Generate a NEW scene featuring the SAME Lumi character from references.
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
