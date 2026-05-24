"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Limpa cookies do Supabase em todos os scopes possíveis (host-only,
 * Domain=.lumioapp.net, Domain=lumioapp.net) e redireciona pro /login.
 *
 * O browser não permite ler cookies httpOnly via document.cookie, mas todos
 * os cookies do Supabase SSR são não-httpOnly (precisa serem legíveis no
 * client pra refresh flow). Então conseguimos enumerar e deletar.
 */
export function ClearSessionClient({
  next,
  reason,
}: {
  next: string;
  reason?: string;
}) {
  const router = useRouter();
  useEffect(() => {
    try {
      const host = window.location.hostname;
      // Variações de domain pra cobrir cookies host-only e cross-subdomain
      const domains = [
        undefined,
        host,
        `.${host}`,
        ".lumioapp.net",
        "lumioapp.net",
      ];
      const cookies = document.cookie.split(";").map((c) => c.trim());
      for (const c of cookies) {
        const name = c.split("=")[0];
        if (!name) continue;
        // Pula cookies não-relacionados (Vercel analytics, etc.) — só apaga
        // o que parece de auth/supabase.
        const isAuthCookie =
          name.startsWith("sb-") ||
          name.startsWith("supabase-") ||
          name.includes("auth-token") ||
          name.includes("code-verifier");
        if (!isAuthCookie) continue;
        for (const domain of domains) {
          const domainPart = domain ? `;domain=${domain}` : "";
          document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/${domainPart}`;
          document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;sameSite=lax${domainPart}`;
        }
      }
      // Limpa localStorage do Supabase (PKCE verifier pode ficar aqui em PKCE flow)
      Object.keys(localStorage).forEach((k) => {
        if (k.startsWith("sb-") || k.startsWith("supabase.")) {
          localStorage.removeItem(k);
        }
      });
    } catch (err) {
      console.warn("[clear-session] cleanup partial", err);
    }
    const timer = setTimeout(() => {
      const q = new URLSearchParams({ next });
      if (reason) q.set("error", reason);
      router.replace(`/login?${q.toString()}`);
    }, 800);
    return () => clearTimeout(timer);
  }, [next, reason, router]);
  return (
    <div className="text-xs text-muted-foreground">Limpando…</div>
  );
}
