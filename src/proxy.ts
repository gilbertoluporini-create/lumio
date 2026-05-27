import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Rotas que NÃO devem passar pelo middleware de auth
const PUBLIC_PATHS = [
  "/",
  "/login",
  "/signup",
  "/pricing",
  "/success",
  "/clear-session",
  "/api/stripe/webhook", // webhook valida via signature
  "/api/health",
];

const PROTECTED_API_PATHS = ["/api/chat", "/api/correlate", "/api/extract-slides", "/api/extract-schedule"];

function isPublic(pathname: string) {
  if (PUBLIC_PATHS.includes(pathname)) return true;
  // Permitir assets (next handles static automaticamente, mas safety)
  if (pathname.startsWith("/_next")) return true;
  if (pathname.startsWith("/favicon")) return true;
  return false;
}

// In-memory rate limiter (simples — em prod usar Upstash Redis pra survivability).
// Em serverless cold starts perdem state, então isto é best-effort.
// Limita: 30 req/min por user_id em rotas que chamam Anthropic.
type Bucket = { count: number; reset: number };
const buckets = new Map<string, Bucket>();
const WINDOW_MS = 60_000;
const MAX_REQ = 30;
const MAX_BUCKETS = 5000; // hard cap pra evitar memory leak

function rateLimit(key: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.reset < now) {
    // GC oportunista: limpa buckets expirados se passar do limite
    if (buckets.size > MAX_BUCKETS) {
      for (const [k, b] of buckets) {
        if (b.reset < now) buckets.delete(k);
        if (buckets.size <= MAX_BUCKETS / 2) break;
      }
    }
    buckets.set(key, { count: 1, reset: now + WINDOW_MS });
    return { allowed: true, remaining: MAX_REQ - 1 };
  }
  if (bucket.count >= MAX_REQ) {
    return { allowed: false, remaining: 0 };
  }
  bucket.count += 1;
  return { allowed: true, remaining: MAX_REQ - bucket.count };
}

/**
 * Detecta subdomínio admin (admin.lumioapp.net, admin-staging.lumioapp.net,
 * admin.localhost:3000 em dev). Quando ativo:
 *  - `/` (root) → rewrite pra `/admin` (raiz vira o painel)
 *  - `/admin/*`, `/login`, `/api/*`, assets → passthrough
 *  - QUALQUER outro path (`/dashboard`, `/lumi`, etc) → REDIRECT 307 pro apex
 *    (`https://www.lumioapp.net{path}`). O subdomain admin só serve o painel.
 */
function isAdminSubdomain(host: string): boolean {
  return /^admin([.-]|$)/i.test(host);
}

/** Paths que ficam no subdomain admin (vivem dentro de /admin/* OU são auth/assets). */
const ADMIN_KEEP_PREFIXES = [
  "/api/",
  "/_next",
  "/favicon",
  "/illustrations",
  "/admin",
  "/login",
  "/signup",
  "/reset-password",
  "/onboarding",
  "/auth/", // /auth/callback do Supabase magic link
  "/account/billing", // pra deixar o user gerenciar pagamento sem sair do admin
];

type AdminHostDecision =
  | { kind: "passthrough" }
  | { kind: "rewrite"; newPath: string }
  | { kind: "redirect_to_apex" };

function decideAdminHostAction(pathname: string): AdminHostDecision {
  // Root → rewrite pra /admin
  if (pathname === "/") return { kind: "rewrite", newPath: "/admin" };
  // Paths que ficam no subdomain → passthrough
  if (
    ADMIN_KEEP_PREFIXES.some(
      (p) => pathname === p || pathname.startsWith(p),
    )
  ) {
    return { kind: "passthrough" };
  }
  // Qualquer outra coisa → redireciona pro apex (subdomain admin é só pro painel)
  return { kind: "redirect_to_apex" };
}

const REF_COOKIE = "lumio_ref";
const REF_COOKIE_MAX_AGE = 60 * 60 * 24 * 60; // 60 dias
const REF_CODE_RE = /^LUMI-[A-Z0-9]{4}$/;

// ---------------------------------------------------------------------------
// Short URLs sociais — /ig, /tt, /li, /tw, /yt
// ---------------------------------------------------------------------------
// Cada redirect captura UTMs eventuais (?campaign=launch), seta cookie de
// outbound attribution (lumio_outbound = base64 do JSON {dest, ts, utm_*})
// pra correlacionar com a sessão se o user voltar pelo /links ou direto,
// e dispara `outbound_social_click` no PostHog server-side (fire-and-forget).
//
// IMPORTANTE: redireciona com 302 (não 301) porque podemos trocar destino
// (ex: handle do twitter mudar) sem ficar refém de cache permanente.
const SOCIAL_REDIRECTS: Record<string, { dest: string; channel: string }> = {
  "/ig": { dest: "https://www.instagram.com/lumioapp.br/", channel: "instagram" },
  "/tt": { dest: "https://www.tiktok.com/@lumioapp", channel: "tiktok" },
  "/li": { dest: "https://www.linkedin.com/company/lumioapp-br/", channel: "linkedin" },
  "/tw": { dest: "https://x.com/lumioapp_br", channel: "twitter" },
  "/yt": { dest: "https://www.youtube.com/@lumioapp", channel: "youtube" },
};

const OUTBOUND_COOKIE = "lumio_outbound";
const OUTBOUND_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 dias

/**
 * Captura evento outbound no PostHog via Capture API (api.posthog.com/capture).
 * Não bloqueia o redirect — sem await, sem catch que propague.
 *
 * Distinct ID: usa o cookie `ph_<key>_posthog` se o user já passou pelo site
 * antes (mesma sessão); caso contrário, gera um anônimo "ob_<channel>_<ts>"
 * (limitação: não-correlacionável com session futura, mas serve pra contar
 * cliques de bio sem signup ainda).
 */
function fireOutboundEvent(opts: {
  channel: string;
  dest: string;
  distinctId: string;
  utm: Record<string, string>;
  referer: string | null;
  userAgent: string | null;
}): void {
  const phKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const phHost = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";
  if (!phKey) return;

  // fire-and-forget — não await pra não atrasar o redirect.
  // Edge runtime: fetch é nativo, mas precisa ser invocado e não esperar.
  // waitUntil seria ideal mas não está universalmente disponível no proxy.ts.
  void fetch(`${phHost}/capture/`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      api_key: phKey,
      event: "outbound_social_click",
      distinct_id: opts.distinctId,
      properties: {
        channel: opts.channel,
        destination: opts.dest,
        $current_url: opts.referer ?? undefined,
        ...opts.utm,
        $useragent: opts.userAgent ?? undefined,
        source: "proxy_redirect",
      },
      timestamp: new Date().toISOString(),
    }),
  }).catch(() => {
    /* fire-and-forget — perdemos o evento, redirect sempre prossegue. */
  });
}

/** Lê o distinct_id do PostHog (cookie ph_*_posthog é JSON URL-encoded). */
function readPosthogDistinctId(request: NextRequest): string | null {
  const phKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!phKey) return null;
  const cookieName = `ph_${phKey}_posthog`;
  const raw = request.cookies.get(cookieName)?.value;
  if (!raw) return null;
  try {
    const decoded = decodeURIComponent(raw);
    const parsed = JSON.parse(decoded) as { distinct_id?: string };
    return parsed.distinct_id ?? null;
  } catch {
    return null;
  }
}

/**
 * Handler dos short URLs sociais. Roda antes de qualquer outra lógica do
 * proxy (auth/admin). Mantém o cookie de ref se vier junto, e seta cookie
 * outbound com info do destino pra usar em correlation depois.
 */
function handleSocialRedirect(
  request: NextRequest,
  match: { dest: string; channel: string },
): NextResponse {
  // Coleta UTMs opcionais (ex: /ig?campaign=launch&content=stories_swipe).
  // Aceita tanto utm_* puro quanto shorthand sem prefixo.
  const sp = request.nextUrl.searchParams;
  const utm: Record<string, string> = {};
  for (const key of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"]) {
    const v = sp.get(key);
    if (v) utm[key] = v;
  }
  // Shorthand: ?campaign=launch → utm_campaign=launch (se não tinha utm_campaign)
  for (const [short, long] of [
    ["campaign", "utm_campaign"],
    ["content", "utm_content"],
    ["term", "utm_term"],
  ] as const) {
    const v = sp.get(short);
    if (v && !utm[long]) utm[long] = v;
  }
  // Default attribution pro short URL em si.
  if (!utm.utm_source) utm.utm_source = match.channel;
  if (!utm.utm_medium) utm.utm_medium = "social_shortlink";

  const distinctId = readPosthogDistinctId(request)
    ?? `ob_${match.channel}_${Date.now().toString(36)}`;

  const referer = request.headers.get("referer");
  const userAgent = request.headers.get("user-agent");

  fireOutboundEvent({
    channel: match.channel,
    dest: match.dest,
    distinctId,
    utm,
    referer,
    userAgent,
  });

  const response = NextResponse.redirect(match.dest, 302);
  response.headers.set("X-Robots-Tag", "noindex");
  response.headers.set("Cache-Control", "private, no-store");

  // Seta outbound cookie pra correlação futura (se user voltar pra signup).
  // Payload pequeno — não usamos pra auth, só analytics.
  const outboundPayload = JSON.stringify({
    dest: match.channel,
    ts: Date.now(),
    utm_source: utm.utm_source,
    utm_medium: utm.utm_medium,
    utm_campaign: utm.utm_campaign,
  });
  response.cookies.set(OUTBOUND_COOKIE, outboundPayload, {
    maxAge: OUTBOUND_COOKIE_MAX_AGE,
    httpOnly: false, // queremos ler client-side no boot pra fundir com utm-tracker
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });

  return response;
}

export async function proxy(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  const onAdminHost = isAdminSubdomain(host);
  const originalPathname = request.nextUrl.pathname;

  // Short URLs sociais (/ig, /tt, /li, /tw, /yt) — atalho ANTES de qualquer
  // outra lógica. Não passam por auth, admin host, supabase session etc.
  // Só funciona no apex (não no admin subdomain).
  if (!onAdminHost) {
    const social = SOCIAL_REDIRECTS[originalPathname];
    if (social) {
      return handleSocialRedirect(request, social);
    }
  }

  // Captura ?ref=LUMI-XXXX em QUALQUER rota: seta cookie httpOnly 60d.
  // Não validamos o code aqui (DB-call no proxy é caro); validação acontece
  // no signup-password ao consumir o cookie e criar redemption.
  // O click logging pode ser feito separadamente via hit explícito em
  // /api/referral/track (analytics-only, não-blocking).
  const refParam = request.nextUrl.searchParams.get("ref");
  const refToSet = refParam && REF_CODE_RE.test(refParam) ? refParam : null;

  // No admin subdomain decide cedo: passthrough (auth/api/assets/admin),
  // rewrite (root /), ou redirect pro apex (qualquer outro app path).
  let adminRewritePath: string | null = null;
  if (onAdminHost) {
    const decision = decideAdminHostAction(originalPathname);
    if (decision.kind === "redirect_to_apex") {
      const apexUrl = request.nextUrl.clone();
      apexUrl.host = "www.lumioapp.net";
      apexUrl.port = "";
      apexUrl.protocol = "https:";
      return NextResponse.redirect(apexUrl, 307);
    }
    if (decision.kind === "rewrite") {
      adminRewritePath = decision.newPath;
    }
    // passthrough → adminRewritePath fica null, continua flow normal
  }
  // Pathname "efetivo" usado nas checagens (auth, rate limit etc).
  const pathname = adminRewritePath ?? originalPathname;

  // Helper: aplica cookie ref nos response (idempotente).
  const applyRefCookie = (res: NextResponse): NextResponse => {
    if (!refToSet) return res;
    const existing = request.cookies.get(REF_COOKIE)?.value;
    if (existing === refToSet) return res; // não rewrite cookie igual
    res.cookies.set(REF_COOKIE, refToSet, {
      maxAge: REF_COOKIE_MAX_AGE,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    });
    return res;
  };

  // Pular tudo que é público
  if (isPublic(pathname)) {
    return applyRefCookie(NextResponse.next());
  }

  // Atualizar sessão Supabase
  const { response, user } = await updateSession(request);

  // Sem Supabase configurado: deixa passar (modo dev/preview); páginas
  // protegidas usam AuthGuard client-side com localStorage como fallback.
  const supabaseConfigured = !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
  if (!supabaseConfigured) {
    return applyRefCookie(response);
  }

  // Rotas API protegidas: exigem usuário autenticado + rate limit
  if (PROTECTED_API_PATHS.some((p) => pathname.startsWith(p))) {
    if (!user) {
      return new NextResponse(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { "content-type": "application/json" } },
      );
    }
    const { allowed, remaining } = rateLimit(user.id);
    response.headers.set("x-ratelimit-remaining", String(remaining));
    if (!allowed) {
      return new NextResponse(
        JSON.stringify({ error: "Rate limit excedido. Tente em 1 minuto." }),
        {
          status: 429,
          headers: {
            "content-type": "application/json",
            "retry-after": "60",
          },
        },
      );
    }
    return applyRefCookie(response);
  }

  // Rotas /app protegidas (dashboard, lecture, onboarding, admin)
  const requiresAuth =
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/lecture") ||
    pathname.startsWith("/onboarding") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/schedule") ||
    pathname.startsWith("/account");

  if (requiresAuth && !user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", pathname);
    return applyRefCookie(NextResponse.redirect(loginUrl));
  }

  // Se estamos no admin subdomain E o path original precisa ser reescrito,
  // transforma a response em rewrite mantendo os cookies que o Supabase setou.
  if (adminRewritePath) {
    const rewriteUrl = request.nextUrl.clone();
    rewriteUrl.pathname = adminRewritePath;
    const rewriteResp = NextResponse.rewrite(rewriteUrl, { request });
    response.cookies.getAll().forEach((c) => {
      rewriteResp.cookies.set(c);
    });
    response.headers.forEach((value, key) => {
      if (
        key.startsWith("x-") ||
        key === "set-cookie" ||
        key === "cache-control"
      ) {
        rewriteResp.headers.set(key, value);
      }
    });
    return applyRefCookie(rewriteResp);
  }

  return applyRefCookie(response);
}

export const config = {
  matcher: [
    /*
     * Match all paths exceto:
     * - _next/static, _next/image, favicon
     * - public assets (.svg, .png, etc.)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
