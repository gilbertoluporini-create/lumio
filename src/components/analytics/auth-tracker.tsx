"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Analytics, identifyUser } from "@/lib/analytics";

/**
 * Componente client montado no layout. Faz 2 coisas:
 *
 * 1. Identifica o user nos providers (PostHog, GA4) sempre que há sessão.
 *    Isso liga o distinct_id anônimo ao user.id real (vital pra funil real).
 *
 * 2. Detecta `?welcome=<provider>` no URL (setado pelo /auth/callback quando
 *    o user acabou de criar conta) e dispara `Analytics.signUp(provider)`,
 *    depois limpa o query param.
 *
 * Sem isso: Google OAuth perde o evento sign_up porque o redirect mata o JS
 * que tentaria chamar `Analytics.signUp("google")` antes.
 */
export function AuthTracker() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const identifiedRef = useRef<string | null>(null);

  // 1) Identify user em qualquer rota que tenha sessão
  useEffect(() => {
    let mounted = true;
    const supabase = (() => {
      try {
        return createClient();
      } catch {
        return null;
      }
    })();
    if (!supabase) return;

    async function applyIdentify(userObj: {
      id: string;
      email?: string;
      user_metadata?: { name?: string; full_name?: string };
    } | null) {
      if (!userObj || !mounted) return;
      if (identifiedRef.current === userObj.id) return;
      identifiedRef.current = userObj.id;
      identifyUser({
        id: userObj.id,
        email: userObj.email,
        name: userObj.user_metadata?.name ?? userObj.user_metadata?.full_name,
      });
    }

    supabase.auth.getUser().then(({ data }: { data: { user: unknown } }) => {
      applyIdentify(data.user as Parameters<typeof applyIdentify>[0]);
    });

    const { data: sub } = supabase.auth.onAuthStateChange(
      (_event: string, session: { user?: unknown } | null) => {
        applyIdentify((session?.user ?? null) as Parameters<typeof applyIdentify>[0]);
      },
    );
    return () => {
      mounted = false;
      sub?.subscription?.unsubscribe?.();
    };
  }, []);

  // 2) ?welcome=<provider>[&new=1] → dispara sign_up (se new) ou log_in,
  //    depois remove os query params.
  useEffect(() => {
    const welcome = params.get("welcome");
    if (!welcome) return;
    const provider = (
      welcome === "google" || welcome === "magic_link" || welcome === "password"
        ? welcome
        : "google"
    ) as "google" | "password" | "magic_link";
    const isNew = params.get("new") === "1";
    if (isNew) Analytics.signUp(provider);
    else Analytics.logIn(provider);

    const next = new URLSearchParams(params.toString());
    next.delete("welcome");
    next.delete("new");
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [params, pathname, router]);

  return null;
}
