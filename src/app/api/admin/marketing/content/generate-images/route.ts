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
 * Imagens de referência canônicas do Lumi — usadas via gpt-image-1 /edits.
 *
 * Atualização 2026-05-27: substituídas pelas 4 imagens "guia oficial" geradas
 * via ChatGPT que mostram o Lumi com a anatomia exata correta:
 *  - Olhos roxo-escuros arredondados com brilho branco PEQUENO
 *  - Cúpula bell-shaped cream com top lilás
 *  - Pescoço bronze segmentado
 *  - Bochechas sutis (NÃO Disney baby exagerado)
 *
 * Mantemos 1 das warmup antigas pra variedade de pose.
 *
 * Trocar essas imagens só se a marca visual mudar.
 */
const REFERENCE_FILENAMES = [
  "ref-lumi-01.jpg",       // "Transcreva sem anotar" — Lumi à direita em mesa
  "ref-lumi-02.jpg",       // "Resumo + flashcards" — Lumi inclinado segurando card
  "ref-lumi-03.jpg",       // "Quiz pré-prova" — Lumi com card de pergunta (fundo roxo)
  "ref-lumi-04.jpg",       // "4 horas de aula em 40 min" — Lumi em cena multi-objetos
  "01-lancamento.jpg",     // Warmup original — Lumi frontal nos livros (variação pose)
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
 * Brand anchor incorporando o DOC OFICIAL v2 do founder
 * (lumio_doc_oficial_api_posts.md). Source of truth visual.
 *
 * Diferenças do v1:
 *  - Paleta expandida com hexes exatos (#21113f, #f3ecff, #f5c542, etc)
 *  - Negative prompt expandido (feminine eyelashes, claymation, etc)
 *  - Composição padrão: safe margin 64px, título 35-55%, URL no rodapé
 *  - Mantém ANTI-TEXT por default (pra refs serem visualmente isentas de erro);
 *    quando user quiser texto exato na imagem, ele descreve na cena específica
 */
const BRAND_ANCHOR = `
========== LUMIO OFFICIAL BRAND v2 (source of truth) ==========

Premium 3D editorial render for an education tech brand called Lumio. Match the exact character design shown in the REFERENCE IMAGES provided. Style: clean, technological, educational, welcoming. Mix of landing page + edtech app + 3D mascot branding + editorial minimalism. Sophisticated design with plenty of breathing space, never crowded.

================ LUMI MASCOT (exact appearance) ================

- Small cute friendly 3D desk lamp character
- Rounded dome/bell-shaped lamp head in warm CREAM color (#fff8e7 / #f7edd8)
- Soft purple/lilac glow INSIDE the bulb (interior radiance)
- Face sits inside the illuminated shade opening
- TWO big, rounded, symmetric purple eyes — well-aligned, friendly, NOT distorted
- Tiny discreet smile (single thin curved line)
- Articulated metallic neck (brown/copper/gray with rounded circular joints)
- Rounded cream base with a small purple button on top
- NO logo or text on the lamp base unless specifically requested
- Chibi proportions but PREMIUM and CLEAN — never childish, never overly feminine
- NO exaggerated/feminine eyelashes
- NO human arms (only the articulated lamp arm)
- NO weird/asymmetric eyes
- NO scary or uncanny expressions

================ VISUAL STYLE ================

- Premium 3D render with soft premium plastic/paper material texture
- NOT clay/plasticine ("massinha") texture
- Soft studio lighting, realistic gentle shadows
- Modern, welcoming, trustworthy atmosphere
- Big rounded typography mood (even when no text — composition implies text-ready space)
- LOTS of breathing room — never crowded
- Strong hierarchy when scene has multiple elements

================ OFFICIAL PALETTE (use these exact hex) ================

Primary purples:
- Deep purple: #21113f / #25114a (backgrounds, contrast)
- Lumio purple: #7c3aed (brand main)
- Fuchsia/magenta: #c026d3 (accent)

Soft tones:
- Light lavender background: #f3ecff / #efe7ff
- Cream: #fff8e7 / #f7edd8
- White card: #ffffff

Accents (sparingly):
- Yellow detail/star: #f5c542
- Discrete success green: #22c55e (rare, only for "completed")
- Red ONLY for "recording/live" tiny dots

Allowed gradients:
- Purple → fuchsia: #7c3aed → #c026d3
- Light bg: #fffaf0 → #f3ecff
- Dark bg: #170b33 → #33126b

================ 3D AUXILIARY ELEMENTS ================

All with same premium 3D finish:
- Purple/magenta/cream books
- Open notebook with cream pages
- Purple/cream microphone
- Summary cards with rounded corners
- Flashcards with lamp/brain/star icons
- Weekly calendar
- Purple coins with simple star symbol (no readable numbers)
- Purple/gold treasure chest
- Audio/transcript/quiz/PDF/flashcard/calendar icons
- 4-point stars, few and well-distributed
- Soft arrows connecting steps
- White rounded cards with light shadow

================ COMPOSITION RULES ================

- Square 1:1 mood (works for any output ratio)
- Safe margin: minimum 64px equivalent
- Title area would occupy 35-55% if text were present
- Lumi position: right, lower-right, or center-bottom (never crowding center)
- "lumioapp.net" URL at bottom-right ONLY if user explicitly requests it
- ONE Lumi per image (never duplicate the mascot)

================ TEXT POLICY ================

By default, generate the image WITH NO TEXT — leave empty negative space for text overlay later (added in Figma/Canva). This avoids misspelling in pt-BR.

IGNORE all text/typography visible in the REFERENCE IMAGES — that was added later in design tools, NOT part of the mascot/style.

Only generate text inside the image if the user's scene description explicitly says "include exact text: X" — and in that case use ONLY pt-BR and the exact provided text, no inventions.

================ STRICT FORBIDS (negative prompt) ================

AVOID at all cost: bad typography, misspelled text, gibberish text, fake words, distorted letters, unreadable text, incorrect Portuguese, extra logos, watermark, random brand names, duplicated mascot, extra eyes, crossed eyes, weird eyes, asymmetric eyes, feminine eyelashes, overly girly style, childish baby-toy style, claymation, rough plasticine, messy composition, crowded layout, low resolution, pixelated, blurry, dark muddy colors, harsh shadows, uncanny face, human body, human arms, extra limbs, scary expression, generic robot, unrelated character, random UI, wrong website, fake app screenshots, text on mascot base unless requested, no humans, no faces other than Lumi.

Generate a NEW scene with the EXACT same Lumi character from references.
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
