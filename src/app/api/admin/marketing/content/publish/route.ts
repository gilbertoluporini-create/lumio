/**
 * POST /api/admin/marketing/content/publish
 *
 * Publica um content_draft em N redes simultaneamente (Fase 1: IG + FB Page).
 * X e LinkedIn entram na Fase 2.
 *
 * Body:
 *   { draft_id, networks: ["instagram", "facebook"] }
 *
 * Resp:
 *   { results: { instagram?: {id, permalink}, facebook?: {id, permalink}, ... },
 *     errors: { ... } }
 *
 * Comportamento:
 *  - Lê draft do banco (content_per_network + images)
 *  - Para cada rede pedida, publica usando a caption/imagem nativa daquela rede
 *  - Atualiza draft.publish_results + draft.status = "published" se >= 1 sucesso
 *  - Não aborta se 1 rede falhar — publica nas outras e retorna errors junto
 *
 * Apenas admin.
 */

import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 90;

const GRAPH = "https://graph.facebook.com/v21.0";

type Network = "instagram" | "facebook" | "x" | "linkedin";
const SUPPORTED_NETWORKS: Network[] = ["instagram", "facebook"];

type DraftRow = {
  id: string;
  content_per_network: Record<string, Record<string, unknown>>;
  images: Record<string, { url: string }>;
  publish_results: Record<string, unknown> | null;
};

// ----- IG publish (reaproveita lógica do /ig-publish) -----------------------

async function publishInstagram(
  draft: DraftRow,
  token: string,
  igId: string,
): Promise<{ id: string; permalink: string | null }> {
  const ig = draft.content_per_network.instagram as
    | { caption?: string; hashtags?: string[] }
    | undefined;
  if (!ig?.caption) throw new Error("instagram caption ausente no draft");

  const img = draft.images.ratio_1x1?.url;
  if (!img) throw new Error("imagem 1:1 ausente no draft");

  const hashtags = Array.isArray(ig.hashtags) ? ig.hashtags.join(" ") : "";
  const fullCaption = `${ig.caption}\n\n${hashtags}`.trim();

  // 1. create container
  const createRes = await fetch(
    `${GRAPH}/${igId}/media?${new URLSearchParams({
      image_url: img,
      caption: fullCaption,
      access_token: token,
    }).toString()}`,
    { method: "POST" },
  );
  const createJson = await createRes.json();
  if (!createRes.ok || !createJson.id) {
    throw new Error(
      `IG container falhou: ${JSON.stringify(createJson.error || createJson).slice(0, 300)}`,
    );
  }
  const containerId = createJson.id as string;

  // 2. wait FINISHED
  for (let i = 0; i < 12; i++) {
    await new Promise((r) => setTimeout(r, 2500));
    const statusRes = await fetch(
      `${GRAPH}/${containerId}?fields=status_code&access_token=${token}`,
    );
    const sj = await statusRes.json();
    if (sj.status_code === "FINISHED") break;
    if (sj.status_code === "ERROR" || sj.status_code === "EXPIRED") {
      throw new Error(`IG container status=${sj.status_code}`);
    }
    if (i === 11) throw new Error("IG container demorou >30s");
  }

  // 3. publish
  const pubRes = await fetch(
    `${GRAPH}/${igId}/media_publish?${new URLSearchParams({
      creation_id: containerId,
      access_token: token,
    }).toString()}`,
    { method: "POST" },
  );
  const pubJson = await pubRes.json();
  if (!pubRes.ok || !pubJson.id) {
    throw new Error(
      `IG publish falhou: ${JSON.stringify(pubJson.error || pubJson).slice(0, 300)}`,
    );
  }

  // 4. permalink (best-effort)
  let permalink: string | null = null;
  try {
    const r = await fetch(
      `${GRAPH}/${pubJson.id}?fields=permalink&access_token=${token}`,
    );
    const j = await r.json();
    permalink = j.permalink || null;
  } catch {
    /* ignore */
  }

  return { id: pubJson.id, permalink };
}

// ----- FB Page publish ------------------------------------------------------

async function getPageToken(
  pageId: string,
  userToken: string,
): Promise<string> {
  const r = await fetch(
    `${GRAPH}/${pageId}?fields=access_token&access_token=${userToken}`,
  );
  const j = await r.json();
  if (!j.access_token) {
    throw new Error("não foi possível obter Page Access Token");
  }
  return j.access_token as string;
}

async function publishFacebook(
  draft: DraftRow,
  userToken: string,
  pageId: string,
): Promise<{ id: string; permalink: string | null }> {
  // Strategy: usar mesma caption do IG (FB aceita o formato) + imagem 1:1
  const ig = draft.content_per_network.instagram as
    | { caption?: string; hashtags?: string[] }
    | undefined;
  const img = draft.images.ratio_1x1?.url;
  if (!ig?.caption || !img) throw new Error("draft incompleto pra FB");

  const hashtags = Array.isArray(ig.hashtags) ? ig.hashtags.join(" ") : "";
  const message = `${ig.caption}\n\n${hashtags}`.trim();

  const pageToken = await getPageToken(pageId, userToken);

  // Publica foto direto: /<page>/photos com `url` + `message`
  const res = await fetch(
    `${GRAPH}/${pageId}/photos?${new URLSearchParams({
      url: img,
      message,
      access_token: pageToken,
    }).toString()}`,
    { method: "POST" },
  );
  const json = await res.json();
  if (!res.ok || !json.id) {
    throw new Error(
      `FB publish falhou: ${JSON.stringify(json.error || json).slice(0, 300)}`,
    );
  }

  // permalink_url
  let permalink: string | null = null;
  try {
    const r = await fetch(
      `${GRAPH}/${json.post_id || json.id}?fields=permalink_url&access_token=${pageToken}`,
    );
    const j = await r.json();
    permalink = j.permalink_url || null;
  } catch {
    /* ignore */
  }

  return { id: json.post_id || json.id, permalink };
}

// ----- Handler --------------------------------------------------------------

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const token = process.env.META_ACCESS_TOKEN;
  const igId = process.env.META_IG_BUSINESS_ACCOUNT_ID;
  const pageId = process.env.META_PAGE_ID;

  if (!token || !igId || !pageId) {
    return NextResponse.json(
      {
        error:
          "META_ACCESS_TOKEN, META_IG_BUSINESS_ACCOUNT_ID ou META_PAGE_ID não configurados",
      },
      { status: 500 },
    );
  }

  const body = await req.json().catch(() => null);
  if (!body?.draft_id) {
    return NextResponse.json({ error: "draft_id obrigatório" }, { status: 400 });
  }

  const requestedNetworks: Network[] = Array.isArray(body.networks)
    ? body.networks.filter((n: string) =>
        SUPPORTED_NETWORKS.includes(n as Network),
      )
    : ["instagram", "facebook"];

  if (requestedNetworks.length === 0) {
    return NextResponse.json(
      {
        error: `nenhuma rede suportada na lista. suportadas: ${SUPPORTED_NETWORKS.join(", ")}`,
      },
      { status: 400 },
    );
  }

  const supabase = createAdminClient();
  const { data: draftRaw, error: fetchErr } = await supabase
    .from("content_drafts")
    .select("*")
    .eq("id", body.draft_id)
    .single();

  if (fetchErr || !draftRaw) {
    return NextResponse.json({ error: "draft não encontrado" }, { status: 404 });
  }

  const draft = draftRaw as unknown as DraftRow;

  const results: Record<string, { id: string; permalink: string | null }> = {};
  const errors: Record<string, string> = {};

  // Publica sequencial pra evitar rate limit do Meta (não em paralelo)
  for (const network of requestedNetworks) {
    try {
      if (network === "instagram") {
        results.instagram = await publishInstagram(draft, token, igId);
      } else if (network === "facebook") {
        results.facebook = await publishFacebook(draft, token, pageId);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "erro desconhecido";
      errors[network] = msg;
    }
  }

  // Atualiza draft com publish_results merge
  const newResults = {
    ...(draft.publish_results || {}),
    ...Object.fromEntries(
      Object.entries(results).map(([net, r]) => [
        net,
        { ...r, published_at: new Date().toISOString() },
      ]),
    ),
  };

  const updates: Record<string, unknown> = {
    publish_results: newResults,
  };
  if (Object.keys(results).length > 0) {
    updates.status = "published";
    updates.published_at = new Date().toISOString();
  }

  await supabase.from("content_drafts").update(updates).eq("id", draft.id);

  return NextResponse.json({
    ok: Object.keys(results).length > 0,
    results,
    errors,
  });
}
