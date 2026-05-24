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

export async function proxy(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  const onAdminHost = isAdminSubdomain(host);
  const originalPathname = request.nextUrl.pathname;

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

  // Pular tudo que é público
  if (isPublic(pathname)) {
    return NextResponse.next();
  }

  // Atualizar sessão Supabase
  const { response, user } = await updateSession(request);

  // Sem Supabase configurado: deixa passar (modo dev/preview); páginas
  // protegidas usam AuthGuard client-side com localStorage como fallback.
  const supabaseConfigured = !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
  if (!supabaseConfigured) {
    return response;
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
    return response;
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
    return NextResponse.redirect(loginUrl);
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
    return rewriteResp;
  }

  return response;
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
