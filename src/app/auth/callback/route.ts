import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const nextParam = url.searchParams.get("next");

  // Default baseado no host: admin.* vai pro painel admin, resto vai
  // pro dashboard. Cobre o caso em que o Supabase OAuth strip o `?next=`
  // do redirectTo durante o flow Google.
  const host = request.headers.get("host") ?? "";
  const isAdminHost = /^admin([.-]|$)/i.test(host);
  const defaultNext = isAdminHost ? "/admin" : "/dashboard";

  // Open-redirect guard: aceita apenas caminhos relativos do próprio site.
  const safeNext =
    nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//")
      ? nextParam
      : defaultNext;

  // Se no admin host mas next aponta pra fora do painel (ex: /dashboard),
  // corrige pra /admin pra evitar redirect cross-domain confuso.
  const next =
    isAdminHost && !safeNext.startsWith("/admin") ? "/admin" : safeNext;

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${url.origin}${next}`);
    }
    // Log detalhado pra debugar via Vercel logs.
    console.error("[auth/callback] exchangeCodeForSession failed", {
      host,
      isAdminHost,
      code_prefix: code.slice(0, 8),
      error_message: error.message,
      error_status: (error as { status?: number }).status,
      error_code: (error as { code?: string }).code,
    });
    // Sintoma típico: cookie PKCE code_verifier ficou em scope host-only de uma
    // sessão anterior. Redireciona pra /clear-session que limpa tudo e manda
    // o user logar de novo.
    const reason = error.message?.toLowerCase().includes("verifier")
      ? "stale_verifier"
      : "callback_failed";
    return NextResponse.redirect(
      `${url.origin}/clear-session?reason=${reason}&next=${encodeURIComponent(next)}`,
    );
  }

  return NextResponse.redirect(
    `${url.origin}/login?error=callback_failed`,
  );
}
