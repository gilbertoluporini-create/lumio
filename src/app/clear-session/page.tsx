/**
 * /clear-session — Página de recovery quando OAuth falha por cookies bagunçados.
 *
 * Limpa todos os cookies relacionados ao Supabase + auth (tanto host-only de
 * sessões antigas quanto Domain=.lumioapp.net do novo flow) e oferece um
 * botão pra refazer o login limpo.
 *
 * Tipicamente disparado pelo /auth/callback quando o PKCE code_verifier
 * não bate (cookie antigo no scope errado).
 */

import Link from "next/link";
import { Suspense } from "react";
import { ClearSessionClient } from "./client";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Lumio — Limpando sessão",
};

type SearchParams = Promise<{ reason?: string; next?: string }>;

export default async function ClearSessionPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const next = sp.next && sp.next.startsWith("/") ? sp.next : "/dashboard";
  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="max-w-md text-center space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">
          Vamos limpar sua sessão
        </h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Uns cookies antigos atrapalharam o login. Em 1 segundo a gente limpa
          tudo e te leva de volta pra entrar.
        </p>
        <Suspense>
          <ClearSessionClient next={next} reason={sp.reason} />
        </Suspense>
        <Link
          href={`/login?next=${encodeURIComponent(next)}`}
          className="inline-block text-xs text-muted-foreground hover:text-foreground underline underline-offset-4"
        >
          Ou clica aqui pra ir direto pra tela de login
        </Link>
      </div>
    </div>
  );
}
