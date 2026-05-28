/**
 * Lógica de publicação multi-rede compartilhada entre:
 *  - POST /api/admin/marketing/content/publish  (admin manual via UI)
 *  - GET  /api/cron/publish-scheduled            (cron Vercel a cada 5min)
 *
 * Fase 1 ativa: instagram + facebook (Meta Graph API)
 * Fase 2 stub: x + linkedin (env vars ausentes hoje, retornam erro claro)
 */

import {
  getXConfigFromEnv,
  postThread,
  postTweet,
  uploadImageToX,
} from "@/lib/publish-x";

const GRAPH = "https://graph.facebook.com/v21.0";
const X_USERNAME = process.env.X_USERNAME || "lumioapp_br";

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

// Lista ordenada de imagens pro carrossel: capa (1x1) + slides 2..10 contíguos.
// 1 url = post simples; 2+ = carrossel.
function carouselImageUrls(draft: DraftForPublish): string[] {
  const urls: string[] = [];
  const cover = draft.images.ratio_1x1?.url;
  if (cover) urls.push(cover);
  for (let n = 2; n <= 10; n++) {
    const s = draft.images[`slide_${n}`];
    if (s?.url) urls.push(s.url);
    else break;
  }
  return urls;
}

// --- Instagram --------------------------------------------------------------

async function igCreateContainer(
  igId: string,
  token: string,
  params: Record<string, string>,
): Promise<string> {
  const res = await fetch(
    `${GRAPH}/${igId}/media?${new URLSearchParams({ ...params, access_token: token }).toString()}`,
    { method: "POST" },
  );
  const json = await res.json();
  if (!res.ok || !json.id) {
    throw new Error(
      `IG container falhou: ${JSON.stringify(json.error || json).slice(0, 300)}`,
    );
  }
  return json.id as string;
}

async function igWaitFinished(containerId: string, token: string): Promise<void> {
  for (let i = 0; i < 12; i++) {
    await new Promise((r) => setTimeout(r, 2500));
    const sRes = await fetch(
      `${GRAPH}/${containerId}?fields=status_code&access_token=${token}`,
    );
    const sj = await sRes.json();
    if (sj.status_code === "FINISHED") return;
    if (sj.status_code === "ERROR" || sj.status_code === "EXPIRED") {
      throw new Error(`IG container status=${sj.status_code}`);
    }
  }
  throw new Error("IG container demorou >30s");
}

async function publishInstagram(
  draft: DraftForPublish,
  token: string,
  igId: string,
): Promise<PublishResult> {
  const ig = draft.content_per_network.instagram as
    | { caption?: string; hashtags?: string[] }
    | undefined;
  if (!ig?.caption) throw new Error("instagram caption ausente");

  const urls = carouselImageUrls(draft);
  if (urls.length === 0) throw new Error("imagem 1:1 ausente");

  const hashtags = Array.isArray(ig.hashtags)
    ? ig.hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ")
    : "";
  const fullCaption = `${ig.caption}\n\n${hashtags}`.trim();

  let creationId: string;
  if (urls.length === 1) {
    creationId = await igCreateContainer(igId, token, {
      image_url: urls[0],
      caption: fullCaption,
    });
    await igWaitFinished(creationId, token);
  } else {
    // carrossel: 1 container por imagem (is_carousel_item) + container CAROUSEL
    const children: string[] = [];
    for (const url of urls) {
      const childId = await igCreateContainer(igId, token, {
        image_url: url,
        is_carousel_item: "true",
      });
      await igWaitFinished(childId, token);
      children.push(childId);
    }
    creationId = await igCreateContainer(igId, token, {
      media_type: "CAROUSEL",
      children: children.join(","),
      caption: fullCaption,
    });
    await igWaitFinished(creationId, token);
  }

  const pubRes = await fetch(
    `${GRAPH}/${igId}/media_publish?${new URLSearchParams({
      creation_id: creationId,
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

async function fbPermalink(
  postId: string,
  pageToken: string,
): Promise<PublishResult> {
  let permalink: string | null = null;
  try {
    const r = await fetch(
      `${GRAPH}/${postId}?fields=permalink_url&access_token=${pageToken}`,
    );
    const j = await r.json();
    permalink = j.permalink_url || null;
  } catch {
    /* ignore */
  }
  return { id: postId, permalink };
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
  const urls = carouselImageUrls(draft);
  if (!captionRaw || urls.length === 0)
    throw new Error("FB: caption ou imagem 1:1 ausente");

  const hashtags = !fb?.caption && Array.isArray(ig?.hashtags)
    ? ig!.hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ")
    : "";
  const message = `${captionRaw}\n\n${hashtags}`.trim();

  const pageToken = await getPageToken(pageId, userToken);

  // 1 imagem → foto direta; 2+ → álbum (fotos unpublished + post no feed)
  if (urls.length === 1) {
    const res = await fetch(
      `${GRAPH}/${pageId}/photos?${new URLSearchParams({
        url: urls[0],
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
    return fbPermalink(json.post_id || json.id, pageToken);
  }

  const mediaFbids: string[] = [];
  for (const url of urls) {
    const r = await fetch(
      `${GRAPH}/${pageId}/photos?${new URLSearchParams({
        url,
        published: "false",
        access_token: pageToken,
      }).toString()}`,
      { method: "POST" },
    );
    const j = await r.json();
    if (!r.ok || !j.id) {
      throw new Error(
        `FB foto (álbum) falhou: ${JSON.stringify(j.error || j).slice(0, 300)}`,
      );
    }
    mediaFbids.push(j.id as string);
  }
  const body = new URLSearchParams({ message, access_token: pageToken });
  mediaFbids.forEach((id, i) =>
    body.append(`attached_media[${i}]`, JSON.stringify({ media_fbid: id })),
  );
  const res = await fetch(`${GRAPH}/${pageId}/feed`, { method: "POST", body });
  const json = await res.json();
  if (!res.ok || !json.id) {
    throw new Error(
      `FB álbum falhou: ${JSON.stringify(json.error || json).slice(0, 300)}`,
    );
  }
  return fbPermalink(json.id, pageToken);
}

// --- Stubs Fase 2 -----------------------------------------------------------

async function publishX(draft: DraftForPublish): Promise<PublishResult> {
  const cfg = getXConfigFromEnv();
  if (!cfg) {
    throw new Error(
      "X não configurado — faltam X_API_KEY/X_API_SECRET/X_ACCESS_TOKEN/X_ACCESS_TOKEN_SECRET",
    );
  }

  const x = draft.content_per_network.x as
    | { thread?: string[]; tweet?: string; hashtags?: string[] }
    | undefined;
  if (!x) throw new Error("X content ausente no metadata");

  // Prefere imagem landscape (16:9); cai pra 1x1 se não tiver
  const imageUrl =
    draft.images.ratio_landscape?.url || draft.images.ratio_1x1?.url;

  const hashtagsStr = Array.isArray(x.hashtags)
    ? " " + x.hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ")
    : "";

  // Modo thread (preferido) ou tweet único
  if (Array.isArray(x.thread) && x.thread.length > 0) {
    const texts = x.thread.map((t, i) =>
      i === x.thread!.length - 1 ? `${t}${hashtagsStr}`.slice(0, 280) : t.slice(0, 280),
    );
    const result = await postThread({
      texts,
      imageUrl,
      username: X_USERNAME,
      cfg,
    });
    return { id: result.tweets[0].id, permalink: result.firstTweetUrl };
  }

  if (typeof x.tweet === "string" && x.tweet.trim()) {
    let mediaIds: string[] | undefined;
    if (imageUrl) {
      const mediaId = await uploadImageToX(imageUrl, cfg);
      mediaIds = [mediaId];
    }
    const t = await postTweet(
      { text: `${x.tweet}${hashtagsStr}`.slice(0, 280), mediaIds },
      cfg,
    );
    return {
      id: t.id,
      permalink: `https://x.com/${X_USERNAME}/status/${t.id}`,
    };
  }

  throw new Error("X content sem thread[] nem tweet — verifique metadata.json");
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
