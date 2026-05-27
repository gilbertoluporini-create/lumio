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
      // First-login detection: se created_at e last_sign_in_at estão a < 60s
      // de distância (ou são iguais), é signup novo. Marca com ?welcome=
      // pra que o tracker client dispare Analytics.signUp().
      // Detecta first-login (signup) vs return (login) comparando created_at
      // com agora. Adiciona welcome=<provider> + new=1 pra signup, só welcome=
      // pra login. O AuthTracker client lê isso e dispara o evento correto.
      let extra = "";
      try {
        const { data: userData } = await supabase.auth.getUser();
        const u = userData.user;
        if (u) {
          const provider = (u.app_metadata?.provider as string | undefined) ?? "google";
          const createdMs = u.created_at ? new Date(u.created_at).getTime() : 0;
          const isNew = createdMs > 0 && (Date.now() - createdMs) / 1000 < 60;
          const sep = next.includes("?") ? "&" : "?";
          extra = isNew
            ? `${sep}welcome=${encodeURIComponent(provider)}&new=1`
            : `${sep}welcome=${encodeURIComponent(provider)}`;
        }
      } catch {
        /* ignore — não bloqueia redirect */
      }
      return NextResponse.redirect(`${url.origin}${next}${extra}`);
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
