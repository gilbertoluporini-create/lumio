import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Rotas que NÃO devem passar pelo middleware de auth
const PUBLIC_PATHS = [
  "/",
  "/login",
  "/signup",
  "/pricing",
  "/success",
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

// In-memory rate limiter (simples — em prod usar Upstash Redis)
// Limita: 30 req/min por user_id em rotas que chamam Anthropic
type Bucket = { count: number; reset: number };
const buckets = new Map<string, Bucket>();
const WINDOW_MS = 60_000;
const MAX_REQ = 30;

function rateLimit(key: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.reset < now) {
    buckets.set(key, { count: 1, reset: now + WINDOW_MS });
    return { allowed: true, remaining: MAX_REQ - 1 };
  }
  if (bucket.count >= MAX_REQ) {
    return { allowed: false, remaining: 0 };
  }
  bucket.count += 1;
  return { allowed: true, remaining: MAX_REQ - bucket.count };
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

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
    pathname.startsWith("/admin");

  if (requiresAuth && !user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
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
