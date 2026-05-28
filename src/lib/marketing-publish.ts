/**
 * Lógica de publicação multi-rede compartilhada entre:
 *  - POST /api/admin/marketing/content/publish  (admin manual via UI)
 *  - GET  /api/cron/publish-scheduled            (cron Vercel a cada 5min)
 *
 * Fase 1 ativa: instagram + facebook (Meta Graph API)
 * Fase 2 stub: x + linkedin (env vars ausentes hoje, retornam erro claro)
 */

const GRAPH = "https://graph.facebook.com/v21.0";

export type Network = "instagram" | "facebook" | "x" | "linkedin";
export const ALL_NETWORKS: Network[] = ["instagram", "facebook", "x", "linkedin"];

export type DraftForPublish = {
  id: string;
  slug: string | null;
  content_per_network: Record<string, Record<string, unknown>>;
  images: Record<string, { url: string } | undefined>;
  publish_results: Record<string, unknown> | null;
};

export type PublishResult = { id: string; permalink: string | null };
export type NetworkResults = Partial<Record<Network, PublishResult>>;
export type NetworkErrors = Partial<Record<Network, string>>;

// --- Instagram --------------------------------------------------------------

async function publishInstagram(
  draft: DraftForPublish,
  token: string,
  igId: string,
): Promise<PublishResult> {
  const ig = draft.content_per_network.instagram as
    | { caption?: string; hashtags?: string[] }
    | undefined;
  if (!ig?.caption) throw new Error("instagram caption ausente");

  const img = draft.images.ratio_1x1?.url;
  if (!img) throw new Error("imagem 1:1 ausente");

  const hashtags = Array.isArray(ig.hashtags)
    ? ig.hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ")
    : "";
  const fullCaption = `${ig.caption}\n\n${hashtags}`.trim();

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

  for (let i = 0; i < 12; i++) {
    await new Promise((r) => setTimeout(r, 2500));
    const sRes = await fetch(
      `${GRAPH}/${containerId}?fields=status_code&access_token=${token}`,
    );
    const sj = await sRes.json();
    if (sj.status_code === "FINISHED") break;
    if (sj.status_code === "ERROR" || sj.status_code === "EXPIRED") {
      throw new Error(`IG container status=${sj.status_code}`);
    }
    if (i === 11) throw new Error("IG container demorou >30s");
  }

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

// --- Facebook Page ----------------------------------------------------------

async function getPageToken(pageId: string, userToken: string): Promise<string> {
  const r = await fetch(
    `${GRAPH}/${pageId}?fields=access_token&access_token=${userToken}`,
  );
  const j = await r.json();
  if (!j.access_token) throw new Error("Page Access Token indisponível");
  return j.access_token as string;
}

async function publishFacebook(
  draft: DraftForPublish,
  userToken: string,
  pageId: string,
): Promise<PublishResult> {
  const fb = draft.content_per_network.facebook as
    | { caption?: string }
    | undefined;
  const ig = draft.content_per_network.instagram as
    | { caption?: string; hashtags?: string[] }
    | undefined;
  // FB usa caption própria se existir, senão herda da IG
  const captionRaw = fb?.caption ?? ig?.caption;
  const img = draft.images.ratio_1x1?.url;
  if (!captionRaw || !img) throw new Error("FB: caption ou imagem 1:1 ausente");

  const hashtags = !fb?.caption && Array.isArray(ig?.hashtags)
    ? ig!.hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ")
    : "";
  const message = `${captionRaw}\n\n${hashtags}`.trim();

  const pageToken = await getPageToken(pageId, userToken);

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

// --- Stubs Fase 2 -----------------------------------------------------------

async function publishX(_draft: DraftForPublish): Promise<PublishResult> {
  // src/lib/publish-x.ts existe mas requer env vars X_API_KEY etc.
  // Quando user criar app developer.x.com e setar env, plugar aqui.
  if (
    !process.env.X_API_KEY ||
    !process.env.X_API_SECRET ||
    !process.env.X_ACCESS_TOKEN ||
    !process.env.X_ACCESS_TOKEN_SECRET
  ) {
    throw new Error(
      "X não configurado — faltam X_API_KEY/X_API_SECRET/X_ACCESS_TOKEN/X_ACCESS_TOKEN_SECRET",
    );
  }
  throw new Error("X publish ainda não plugado (publish-x.ts disponível, integração pendente)");
}

async function publishLinkedIn(_draft: DraftForPublish): Promise<PublishResult> {
  throw new Error(
    "LinkedIn não implementado — criar app em developer.linkedin.com e aguardar Community Management API",
  );
}

// --- Orquestrador -----------------------------------------------------------

export async function publishDraftToNetworks(
  draft: DraftForPublish,
  networks: Network[],
): Promise<{ results: NetworkResults; errors: NetworkErrors }> {
  const token = process.env.META_ACCESS_TOKEN;
  const igId = process.env.META_IG_BUSINESS_ACCOUNT_ID;
  const pageId = process.env.META_PAGE_ID;

  const results: NetworkResults = {};
  const errors: NetworkErrors = {};

  for (const network of networks) {
    try {
      if (network === "instagram") {
        if (!token || !igId) throw new Error("META_ACCESS_TOKEN/IG_BUSINESS_ACCOUNT_ID ausentes");
        results.instagram = await publishInstagram(draft, token, igId);
      } else if (network === "facebook") {
        if (!token || !pageId) throw new Error("META_ACCESS_TOKEN/META_PAGE_ID ausentes");
        results.facebook = await publishFacebook(draft, token, pageId);
      } else if (network === "x") {
        results.x = await publishX(draft);
      } else if (network === "linkedin") {
        results.linkedin = await publishLinkedIn(draft);
      }
    } catch (err) {
      errors[network] = err instanceof Error ? err.message : "erro desconhecido";
    }
  }

  return { results, errors };
}

export function extractTargetNetworks(draft: DraftForPublish): Network[] {
  const targets = (draft.publish_results || {}) as Record<string, unknown>;
  const t = targets.networks_target as Record<string, boolean> | undefined;
  if (t && typeof t === "object") {
    return Object.keys(t).filter((n): n is Network =>
      ALL_NETWORKS.includes(n as Network),
    );
  }
  // fallback: redes com content presente
  return ALL_NETWORKS.filter((n) => n in (draft.content_per_network || {}));
}
