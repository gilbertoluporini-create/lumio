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
 * Heurística pra montar prompt fotográfico ao invés de "ilustração de IA".
 * Inputs: título do artigo + categoria. Resultado: prompt em inglês com
 * âncoras de estilo documental.
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
  // Ânoras visuais por categoria — temas concretos do mundo real
  const CATEGORY_ANCHORS: Record<string, string> = {
    "primeiros-passos":
      "young Brazilian university student opening a laptop at a clean wooden desk, golden hour daylight from a window, focused expression, books and coffee mug nearby",
    gravacoes:
      "modern smartphone on a notebook with handwritten notes, neutral lecture-hall background slightly out of focus, soft daylight",
    resumos:
      "neatly arranged printed pages and highlighters on a minimalist desk, top-down editorial flatlay, natural daylight",
    "flashcards-quiz":
      "small index cards laid out on a marble surface with a pen, top-down composition, editorial flatlay",
    contas:
      "abstract clean minimal desk with a smartphone showing a generic dashboard mockup, soft daylight, no readable UI",
  };

  const anchor =
    CATEGORY_ANCHORS[categorySlug] ??
    "young university student studying in a clean modern workspace, natural daylight";

  return [
    `Editorial documentary photograph for an article titled "${title}".`,
    `Brief context: ${excerpt}`,
    "",
    `Subject: ${anchor}`,
    "",
    "Style: shot on a 50mm lens at f/2.8, shallow depth of field, soft natural window light, muted earth-tone palette, photorealistic, single clean focal subject.",
    "Avoid: text overlays, captions, watermarks, logos, multiple subjects, oversaturation, neon colors, 3D render look, AI-style hyperreal skin, fantasy elements, anything visibly synthetic.",
    "Mood: calm, professional, aspirational — feels like a real lifestyle photograph from a magazine like Monocle or The New Yorker.",
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
