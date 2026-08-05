"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getCurrentUserAsync } from "@/lib/auth";
import { ProgressBar } from "@/components/ui/progress-bar";
import type { User } from "@/lib/types";

type Props = {
  children: (user: User) => React.ReactNode;
  requireOnboarding?: boolean;
};

/**
 * Sessão lembrada ENTRE navegações.
 *
 * Cada página do app monta o próprio <AuthGuard> (são ~29 assim), então sem
 * este cache TODA troca de aba nascia com user=null: a tela inteira — sidebar
 * inclusa — era coberta pela barra "Carregando…" enquanto a checagem pagava
 * DOIS roundtrips (auth.getUser + select em profiles). Era a "troca de telas
 * lenta" relatada em 03/08.
 *
 * Com o cache, só o PRIMEIRO acesso da sessão valida na frente da tela; as
 * navegações seguintes renderizam imediatamente com o usuário lembrado e
 * revalidam POR TRÁS — se a sessão tiver morrido nesse meio tempo, o redirect
 * pro /login acontece do mesmo jeito, só que sem segurar a navegação de quem
 * está logado (que é o caso de ~100% das trocas de aba).
 *
 * Módulo, não Context: sobrevive ao unmount da página e morre no refresh —
 * exatamente o tempo de vida que uma lembrança de sessão deve ter.
 */
let rememberedUser: User | null = null;

/** Chamar no logout: sem isto a próxima navegação flasharia o app logado. */
export function forgetAuthGuardUser(): void {
  rememberedUser = null;
}

export function AuthGuard({ children, requireOnboarding = true }: Props) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(rememberedUser);
  const [ready, setReady] = useState(rememberedUser !== null);

  useEffect(() => {
    let active = true;
    getCurrentUserAsync().then((current) => {
      if (!active) return;
      if (!current) {
        rememberedUser = null;
        router.replace("/login");
        return;
      }
      if (requireOnboarding && !current.onboardedAt) {
        router.replace("/onboarding");
        return;
      }
      rememberedUser = current;
      setUser(current);
      setReady(true);
    });
    return () => {
      active = false;
    };
  }, [router, requireOnboarding]);

  if (!ready || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        {/* Barra em vez de spinner: a checagem de sessão faz roundtrip de rede,
            e um spinner parado nesse intervalo passa sensação de travado. */}
        <ProgressBar
          active
          estimatedMs={2200}
          label="Carregando…"
          showPercent={false}
          className="max-w-[260px]"
        />
      </div>
    );
  }
  return <>{children(user)}</>;
}
