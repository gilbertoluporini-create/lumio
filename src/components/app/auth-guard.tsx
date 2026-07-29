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

export function AuthGuard({ children, requireOnboarding = true }: Props) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    getCurrentUserAsync().then((current) => {
      if (!active) return;
      if (!current) {
        router.replace("/login");
        return;
      }
      if (requireOnboarding && !current.onboardedAt) {
        router.replace("/onboarding");
        return;
      }
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
