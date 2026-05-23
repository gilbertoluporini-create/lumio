/**
 * Rate limit in-memory — primeira linha de defesa contra abuso.
 *
 * Limitação: em ambiente serverless (Vercel), cada cold start começa com Map
 * vazio. Mesmo assim, dentro de uma instância quente, ele segura bursts.
 * Pra rate-limit forte, usar Upstash Redis ou Vercel KV.
 *
 * Janela deslizante simples.
 */

type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();

const CLEANUP_INTERVAL_MS = 60_000;
let lastCleanup = Date.now();

function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  for (const [key, b] of buckets) {
    if (b.resetAt < now) buckets.delete(key);
  }
  lastCleanup = now;
}

export type RateLimitResult = {
  ok: boolean;
  limit: number;
  remaining: number;
  resetIn: number; // segundos
};

/**
 * @param key — chave única (ex: `chat:userId` ou `chat:ip`)
 * @param limit — quantidade máxima por janela
 * @param windowMs — janela em milissegundos
 */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  cleanup();
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return {
      ok: true,
      limit,
      remaining: limit - 1,
      resetIn: Math.ceil(windowMs / 1000),
    };
  }

  if (bucket.count >= limit) {
    return {
      ok: false,
      limit,
      remaining: 0,
      resetIn: Math.ceil((bucket.resetAt - now) / 1000),
    };
  }

  bucket.count += 1;
  return {
    ok: true,
    limit,
    remaining: limit - bucket.count,
    resetIn: Math.ceil((bucket.resetAt - now) / 1000),
  };
}

/** Extrai melhor IP do request — tolera proxies (Vercel, Cloudflare). */
export function getClientIp(req: Request): string {
  const headers = req.headers;
  const xff = headers.get("x-forwarded-for");
  if (xff) {
    return xff.split(",")[0].trim();
  }
  return (
    headers.get("x-real-ip") ??
    headers.get("cf-connecting-ip") ??
    "unknown"
  );
}

/**
 * Preset comum: rate limit por user OU IP, com janela de 1 minuto.
 * Retorna 429 se exceder.
 */
export function limitOrThrow(
  key: string,
  limit: number,
  windowMs: number = 60_000,
): Response | null {
  const result = rateLimit(key, limit, windowMs);
  if (!result.ok) {
    return Response.json(
      {
        error: `Muitas requisições. Tente novamente em ${result.resetIn}s.`,
        retryAfter: result.resetIn,
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(result.resetIn),
          "X-RateLimit-Limit": String(result.limit),
          "X-RateLimit-Remaining": "0",
        },
      },
    );
  }
  return null;
}
