/**
 * POST /api/admin/articles/generate-cover
 *
 * Gera 1 capa via OpenAI gpt-image-1 pra um artigo da Central de Ajuda,
 * faz upload pro bucket público `article-covers` e salva URL na tabela
 * `help_article_covers`.
 *
 * Body: { slug: string, categorySlug: string, title: string, excerpt: string }
 * Resp: { url: string, prompt: string }
 *
 * Admin-only. Custo: ~$0.04/capa (gpt-image-1 medium quality).
 */

import { requireAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/server";
import {
  generateImageOpenAI,
  isOpenAIImageConfigured,
} from "@/lib/openai-image";
import { logAiUsage } from "@/lib/ai-usage";
import { logAndSanitize } from "@/lib/api-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const STORAGE_BUCKET = "article-covers";

type Body = {
  slug?: string;
  categorySlug?: string;
  title?: string;
  excerpt?: string;
};

/**
 * Prompt das capas dos artigos — **padrão Lumi**.
 *
 * Decisão: todas as capas mostram o mascote Lumi (lâmpada antropomórfica
 * estilo Pixar — corpo de lâmpada bege, olhos grandes amigáveis, braços
 * articulados de metal, cabeça redonda com globo de vidro) em uma cena
 * relacionada ao tópico do artigo. Sem fotos realistas, sem estudantes
 * humanos genéricos — o personagem Lumi conduz a identidade visual.
 *
 * Anti-noise: gpt-image-1 tem grain perceptível. Pedimos "smooth, clean,
 * flat-vector look" pra suavizar; o CSS aplica filter:contrast leve por
 * cima na renderização.
 */
function buildCoverPrompt({
  title,
  excerpt,
  categorySlug,
}: {
  title: string;
  excerpt: string;
  categorySlug: string;
}): string {
  // Cena específica por categoria — sempre com o Lumi como protagonista
  const CATEGORY_SCENE: Record<string, string> = {
    "primeiros-passos":
      "Lumi the friendly lamp mascot sitting on a clean wooden desk, holding a small open book, looking at the viewer with a welcoming smile, soft purple ambient glow",
    gravacoes:
      "Lumi the friendly lamp mascot in front of a tiny floating microphone, sound waves drawn as soft curves around it, sitting on a notebook",
    resumos:
      "Lumi the friendly lamp mascot at a small desk, organizing floating paper sheets that funnel into a single neat stack — the funnel-of-summary metaphor",
    "flashcards-quiz":
      "Lumi the friendly lamp mascot holding two oversized flashcards, with question-mark icons floating around, playful and curious expression",
    contas:
      "Lumi the friendly lamp mascot next to a stylized coin (gold purple gradient) and a small dashboard panel, neutral background",
  };

  const scene =
    CATEGORY_SCENE[categorySlug] ??
    "Lumi the friendly lamp mascot studying at a clean desk, surrounded by floating books and notes, warm welcoming pose";

  return [
    `Illustrated cover image for an article titled "${title}".`,
    `Brief context: ${excerpt}`,
    "",
    "MAIN CHARACTER (must be the visual anchor): Lumi — a friendly anthropomorphic desk lamp mascot in Pixar/3D style. Body is a beige rounded lamp base, articulated metallic arm, round head with a glass bulb, large expressive friendly eyes, no mouth or a subtle smile. Lumi is the brand mascot of an app for students — feels approachable, curious, warm.",
    "",
    `Scene: ${scene}.`,
    "",
    "Visual style: clean modern 3D illustration with soft shading, pastel palette with subtle violet/purple accent (Lumi's brand color #7c3aed), smooth gradient background going from soft lavender to off-white, NO photographic grain, NO noise texture, NO film grain, flat clean surfaces, single focal subject (Lumi) centered, generous negative space around the character.",
    "",
    "Avoid strictly: photorealism, real human faces, text overlays, captions, watermarks, logos, multiple competing subjects, oversaturated neon, busy/cluttered backgrounds, dark moody lighting, AI-style hyperreal textures, visible grain or noise, fantasy creatures other than Lumi.",
    "Mood: warm, welcoming, educational, optimistic — feels like a friendly cover from a children's educational app or a Duolingo-style learning product.",
  ].join("\n");
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  if (!isOpenAIImageConfigured()) {
    return Response.json(
      { error: "OPENAI_API_KEY não configurada no servidor." },
      { status: 503 },
    );
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return Response.json({ error: "JSON inválido." }, { status: 400 });
  }

  const slug = (body.slug ?? "").trim();
  const categorySlug = (body.categorySlug ?? "").trim();
  const title = (body.title ?? "").trim();
  const excerpt = (body.excerpt ?? "").trim();

  if (!slug || !categorySlug || !title) {
    return Response.json(
      { error: "slug, categorySlug e title são obrigatórios." },
      { status: 400 },
    );
  }

  const apiKey = process.env.OPENAI_API_KEY as string;
  const prompt = buildCoverPrompt({ title, excerpt, categorySlug });

  try {
    const { b64 } = await generateImageOpenAI({
      prompt,
      quality: "medium",
      size: "1536x1024", // landscape — combina com capa de artigo
      apiKey,
    });

    const buffer = Buffer.from(b64, "base64");
    const admin = createAdminClient();
    // Path estável pra slug → permite overwrite (regenerar capa)
    const key = `${categorySlug}/${slug}.png`;
    const { error: upErr } = await admin.storage
      .from(STORAGE_BUCKET)
      .upload(key, buffer, {
        contentType: "image/png",
        upsert: true,
      });
    if (upErr) {
      console.error("[generate-cover] upload failed", upErr);
      return Response.json(
        { error: `Upload falhou: ${upErr.message}` },
        { status: 500 },
      );
    }

    const { data: pub } = admin.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(key);
    const url = pub?.publicUrl;
    if (!url) {
      return Response.json(
        { error: "Bucket sem getPublicUrl válida." },
        { status: 500 },
      );
    }

    // Upsert na tabela slug → url
    const { error: tableErr } = await admin
      .from("help_article_covers")
      .upsert(
        {
          slug,
          category_slug: categorySlug,
          image_url: url,
          prompt,
          generated_at: new Date().toISOString(),
        },
        { onConflict: "slug" },
      );
    if (tableErr) {
      console.error("[generate-cover] upsert failed", tableErr);
      return Response.json(
        { error: `Persistência falhou: ${tableErr.message}` },
        { status: 500 },
      );
    }

    // Telemetria de custo (landscape medium = ~$0.063/img)
    try {
      await logAiUsage({
        userId: auth.admin.id,
        endpoint: "admin/articles/generate-cover",
        model: "gpt-image-1-landscape",
        imagesCount: 1,
      });
    } catch {
      /* ignora — telemetria não derruba fluxo */
    }

    return Response.json({ url, prompt });
  } catch (err) {
    return Response.json(logAndSanitize("api/admin/articles/generate-cover", err), {
      status: 500,
    });
  }
}
