/**
 * Publicação no X (Twitter) — OAuth 1.0a User Context + Media Upload + Tweet/Thread.
 *
 * Por que OAuth 1.0a e não 2.0:
 *   - Tweet writes (`POST /2/tweets`) com User Context aceitam OAuth 2.0 PKCE
 *     OU OAuth 1.0a. PKCE requer refresh flow (mais cliente-side).
 *   - Media upload (`POST /1.1/media/upload.json`) ainda exige OAuth 1.0a.
 *   - Pra app só nosso (single account = @lumioapp.br), OAuth 1.0a com 4 tokens
 *     estáticos é mais simples — sem refresh, sem expiry.
 *
 * Envs requeridas (.env.local):
 *   X_API_KEY                = consumer key
 *   X_API_SECRET             = consumer secret
 *   X_ACCESS_TOKEN           = access token do usuário (gerado no developer portal)
 *   X_ACCESS_TOKEN_SECRET    = access token secret
 *
 * Doc:
 *   - https://developer.x.com/en/docs/authentication/oauth-1-0a
 *   - https://developer.x.com/en/docs/twitter-api/v1/media/upload-media/api-reference/post-media-upload
 *   - https://developer.x.com/en/docs/twitter-api/tweets/manage-tweets/api-reference/post-tweets
 *
 * Limites free tier (jan/2026):
 *   - 50 tweets criados / 24h por usuário
 *   - 5MB max por imagem (PNG, JPG, GIF, WEBP)
 */

import crypto from "node:crypto";

const UPLOAD_URL = "https://upload.x.com/1.1/media/upload.json";
const TWEET_URL = "https://api.x.com/2/tweets";

export type XConfig = {
  apiKey: string;
  apiSecret: string;
  accessToken: string;
  accessTokenSecret: string;
};

export function getXConfigFromEnv(): XConfig | null {
  const apiKey = process.env.X_API_KEY;
  const apiSecret = process.env.X_API_SECRET;
  const accessToken = process.env.X_ACCESS_TOKEN;
  const accessTokenSecret = process.env.X_ACCESS_TOKEN_SECRET;
  if (!apiKey || !apiSecret || !accessToken || !accessTokenSecret) {
    return null;
  }
  return { apiKey, apiSecret, accessToken, accessTokenSecret };
}

// -----------------------------------------------------------------------------
// OAuth 1.0a signing (HMAC-SHA1, RFC 5849)
// -----------------------------------------------------------------------------

function percentEncode(s: string): string {
  return encodeURIComponent(s)
    .replace(/[!*'()]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

function generateNonce(): string {
  return crypto.randomBytes(32).toString("hex");
}

function buildAuthorizationHeader(
  method: "GET" | "POST",
  url: string,
  params: Record<string, string>,
  cfg: XConfig,
): string {
  const oauthParams: Record<string, string> = {
    oauth_consumer_key: cfg.apiKey,
    oauth_nonce: generateNonce(),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: cfg.accessToken,
    oauth_version: "1.0",
  };

  // Signature base: TODOS os params (query + body + oauth) ordenados
  const allParams = { ...oauthParams, ...params };
  const sortedKeys = Object.keys(allParams).sort();
  const paramString = sortedKeys
    .map((k) => `${percentEncode(k)}=${percentEncode(allParams[k])}`)
    .join("&");

  const baseString = [
    method,
    percentEncode(url),
    percentEncode(paramString),
  ].join("&");

  const signingKey = `${percentEncode(cfg.apiSecret)}&${percentEncode(cfg.accessTokenSecret)}`;
  const signature = crypto
    .createHmac("sha1", signingKey)
    .update(baseString)
    .digest("base64");

  const oauthFinal: Record<string, string> = {
    ...oauthParams,
    oauth_signature: signature,
  };
  const header =
    "OAuth " +
    Object.keys(oauthFinal)
      .sort()
      .map((k) => `${percentEncode(k)}="${percentEncode(oauthFinal[k])}"`)
      .join(", ");
  return header;
}

// -----------------------------------------------------------------------------
// Media upload (1.1)
// -----------------------------------------------------------------------------

/**
 * Sobe imagem (base64) pro X media servers. Retorna media_id_string.
 * Simple upload — limite 5MB. Pra >5MB precisaria chunked upload (não implementado).
 */
export async function uploadImageToX(
  imageUrl: string,
  cfg: XConfig,
): Promise<string> {
  // Baixa a imagem da URL pública (Supabase Storage)
  const imgRes = await fetch(imageUrl);
  if (!imgRes.ok) {
    throw new Error(`falha ao baixar imagem: HTTP ${imgRes.status}`);
  }
  const imgBuffer = Buffer.from(await imgRes.arrayBuffer());
  if (imgBuffer.length > 5 * 1024 * 1024) {
    throw new Error(`imagem >5MB (${imgBuffer.length} bytes) — X não aceita`);
  }
  const mediaB64 = imgBuffer.toString("base64");

  // POST multipart simulado via x-www-form-urlencoded — X aceita media_data em body
  const params: Record<string, string> = {
    media_data: mediaB64,
  };

  const authHeader = buildAuthorizationHeader("POST", UPLOAD_URL, params, cfg);

  const body = new URLSearchParams(params).toString();

  const res = await fetch(UPLOAD_URL, {
    method: "POST",
    headers: {
      Authorization: authHeader,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.media_id_string) {
    throw new Error(
      `X media upload falhou: HTTP ${res.status} ${JSON.stringify(json).slice(0, 300)}`,
    );
  }
  return json.media_id_string as string;
}

// -----------------------------------------------------------------------------
// Tweet (v2)
// -----------------------------------------------------------------------------

export type TweetParams = {
  text: string;
  mediaIds?: string[];
  replyToTweetId?: string;
};

export type TweetResponse = {
  id: string;
  text: string;
};

/**
 * Posta 1 tweet. Pode ter até 4 media_ids e/ou ser resposta a outro tweet.
 */
export async function postTweet(
  params: TweetParams,
  cfg: XConfig,
): Promise<TweetResponse> {
  // Body JSON pra v2. OAuth 1.0a signing pra v2 com JSON body usa params VAZIOS
  // (só os oauth_*). Não inclui o JSON no base string.
  const authHeader = buildAuthorizationHeader("POST", TWEET_URL, {}, cfg);

  const body: Record<string, unknown> = { text: params.text };
  if (params.mediaIds && params.mediaIds.length > 0) {
    body.media = { media_ids: params.mediaIds };
  }
  if (params.replyToTweetId) {
    body.reply = { in_reply_to_tweet_id: params.replyToTweetId };
  }

  const res = await fetch(TWEET_URL, {
    method: "POST",
    headers: {
      Authorization: authHeader,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.data?.id) {
    throw new Error(
      `X tweet falhou: HTTP ${res.status} ${JSON.stringify(json).slice(0, 300)}`,
    );
  }
  return { id: json.data.id, text: json.data.text };
}

// -----------------------------------------------------------------------------
// Thread helper (orquestra múltiplos tweets em sequência)
// -----------------------------------------------------------------------------

export type ThreadResult = {
  tweets: TweetResponse[];
  firstTweetUrl: string;
};

/**
 * Posta uma thread: 1º tweet com imagem (se houver), demais como replies.
 * Se algum tweet falhar no meio, lança erro mas mantém os já publicados.
 */
export async function postThread({
  texts,
  imageUrl,
  username,
  cfg,
}: {
  texts: string[];
  imageUrl?: string;
  username: string; // pra montar permalink (ex: "lumioapp_br")
  cfg: XConfig;
}): Promise<ThreadResult> {
  if (texts.length === 0) throw new Error("thread vazia");

  // 1. Upload mídia (se houver) — anexa só no 1º tweet
  let mediaIds: string[] | undefined;
  if (imageUrl) {
    const mediaId = await uploadImageToX(imageUrl, cfg);
    mediaIds = [mediaId];
  }

  // 2. Posta tweets em sequência
  const results: TweetResponse[] = [];
  let replyTo: string | undefined;

  for (let i = 0; i < texts.length; i++) {
    const t = texts[i].slice(0, 280); // X limita a 280 — truncate defensivo
    const tweet = await postTweet(
      {
        text: t,
        mediaIds: i === 0 ? mediaIds : undefined,
        replyToTweetId: replyTo,
      },
      cfg,
    );
    results.push(tweet);
    replyTo = tweet.id;
  }

  const firstTweetUrl = `https://x.com/${username}/status/${results[0].id}`;
  return { tweets: results, firstTweetUrl };
}
