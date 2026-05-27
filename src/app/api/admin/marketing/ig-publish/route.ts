/**
 * POST /api/admin/marketing/ig-publish
 *
 * Publica imagem no Instagram via Graph API (2 steps: create container + publish).
 *
 * Body:
 *   { post_id: "01" }            → resolve via IG_POSTS data
 *   ou { image_url, caption }    → publicação ad-hoc
 *
 * Resp: { id: <ig_media_id>, permalink, post_id?: <ref> }
 *
 * Requer:
 *   - META_ACCESS_TOKEN com scope `instagram_content_publish`
 *   - META_IG_BUSINESS_ACCOUNT_ID = 17841432871612622 (lumioapp.br)
 *
 * Limitações Meta:
 *   - Container expira em 24h se não publicar
 *   - Status precisa virar "FINISHED" antes de publicar (delay 5-30s)
 *   - Quota: 25 publish/dia por conta IG (resetam a cada 24h sliding)
 *
 * Apenas admin.
 */

import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { getPostById, type IgPost } from "@/lib/ig-posts-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GRAPH = "https://graph.facebook.com/v21.0";

type PublishInput = { image_url: string; caption: string; post_id?: string };

async function createContainer(
  igId: string,
  token: string,
  input: PublishInput,
): Promise<string> {
  const params = new URLSearchParams({
    image_url: input.image_url,
    caption: input.caption,
    access_token: token,
  });
  const r = await fetch(`${GRAPH}/${igId}/media?${params.toString()}`, {
    method: "POST",
  });
  const j = await r.json();
  if (!r.ok || !j.id) {
    throw new Error(
      `container falhou: ${JSON.stringify(j.error || j).slice(0, 300)}`,
    );
  }
  return j.id as string;
}

async function waitContainerReady(
  containerId: string,
  token: string,
  maxAttempts = 12,
  delayMs = 2500,
): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    const r = await fetch(
      `${GRAPH}/${containerId}?fields=status_code,status&access_token=${token}`,
    );
    const j = await r.json();
    if (j.status_code === "FINISHED") return;
    if (j.status_code === "ERROR" || j.status_code === "EXPIRED") {
      throw new Error(`container falhou status=${j.status_code} (${j.status})`);
    }
    await new Promise((res) => setTimeout(res, delayMs));
  }
  throw new Error("container ainda processando após 30s — tente de novo");
}

async function publishContainer(
  igId: string,
  containerId: string,
  token: string,
): Promise<string> {
  const params = new URLSearchParams({
    creation_id: containerId,
    access_token: token,
  });
  const r = await fetch(
    `${GRAPH}/${igId}/media_publish?${params.toString()}`,
    { method: "POST" },
  );
  const j = await r.json();
  if (!r.ok || !j.id) {
    throw new Error(
      `publish falhou: ${JSON.stringify(j.error || j).slice(0, 300)}`,
    );
  }
  return j.id as string;
}

async function fetchPermalink(mediaId: string, token: string): Promise<string | null> {
  try {
    const r = await fetch(
      `${GRAPH}/${mediaId}?fields=permalink&access_token=${token}`,
    );
    const j = await r.json();
    return j.permalink || null;
  } catch {
    return null;
  }
}

function buildPublicImageUrl(filename: string): string {
  // URL pública (deve estar em prod, não localhost)
  const base = process.env.NEXT_PUBLIC_SITE_URL || "https://lumioapp.net";
  return `${base.replace(/\/$/, "")}/instagram/lumi-posts/${filename}`;
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const token = process.env.META_ACCESS_TOKEN;
  const igId = process.env.META_IG_BUSINESS_ACCOUNT_ID;
  if (!token || !igId) {
    return NextResponse.json(
      { error: "META_ACCESS_TOKEN ou META_IG_BUSINESS_ACCOUNT_ID não configurados" },
      { status: 500 },
    );
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "body inválido" }, { status: 400 });

  let post: IgPost | undefined;
  let input: PublishInput;

  if (body.post_id) {
    post = getPostById(String(body.post_id));
    if (!post) {
      return NextResponse.json(
        { error: `post_id "${body.post_id}" não encontrado em IG_POSTS` },
        { status: 404 },
      );
    }
    input = {
      image_url: buildPublicImageUrl(post.filename),
      caption: post.caption,
      post_id: post.id,
    };
  } else if (body.image_url && body.caption) {
    input = {
      image_url: String(body.image_url),
      caption: String(body.caption),
    };
  } else {
    return NextResponse.json(
      { error: "passe { post_id } ou { image_url, caption }" },
      { status: 400 },
    );
  }

  try {
    const containerId = await createContainer(igId, token, input);
    await waitContainerReady(containerId, token);
    const mediaId = await publishContainer(igId, containerId, token);
    const permalink = await fetchPermalink(mediaId, token);

    return NextResponse.json({
      ok: true,
      id: mediaId,
      permalink,
      container_id: containerId,
      post_id: post?.id ?? null,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "erro desconhecido";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

/**
 * GET — lista os 9 posts editorias + verifica se já tem post no IG com mesma
 * caption (best-effort, busca nos últimos 25 media). Usado pelo painel pra
 * marcar quais já foram publicados.
 */
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const token = process.env.META_ACCESS_TOKEN;
  const igId = process.env.META_IG_BUSINESS_ACCOUNT_ID;

  const { IG_POSTS } = await import("@/lib/ig-posts-data");

  let publishedSignatures = new Set<string>();
  let mediaCount = 0;

  if (token && igId) {
    try {
      const r = await fetch(
        `${GRAPH}/${igId}/media?fields=id,caption,permalink&limit=25&access_token=${token}`,
      );
      const j = await r.json();
      if (Array.isArray(j.data)) {
        mediaCount = j.data.length;
        for (const m of j.data) {
          if (m.caption) {
            // signature: primeiros 40 chars normalizados pra match com nossos posts
            publishedSignatures.add(
              String(m.caption).trim().slice(0, 40).toLowerCase(),
            );
          }
        }
      }
    } catch {
      // ignora falha de fetch — UI funciona sem
    }
  }

  const posts = IG_POSTS.map((p) => {
    const sig = p.caption.trim().slice(0, 40).toLowerCase();
    return {
      ...p,
      image_url: buildPublicImageUrl(p.filename),
      already_published: publishedSignatures.has(sig),
    };
  });

  return NextResponse.json({ posts, ig_media_count: mediaCount });
}
