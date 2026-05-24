import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import { getSharedCookieDomain } from "./cookie-domain";
import type { Database } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function createClient(): Promise<any> {
  const cookieStore = await cookies();
  const headerStore = await headers();
  const host = headerStore.get("host") ?? "";
  const sharedDomain = getSharedCookieDomain(host);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    throw new Error("Supabase não configurado (server).");
  }
  return createServerClient<Database>(url, anon, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            // Em prod, propaga cookie pra todos os subdomains de lumioapp.net
            // (assim admin.lumioapp.net e www.lumioapp.net compartilham sessão).
            const opts = sharedDomain
              ? { ...options, domain: sharedDomain }
              : options;
            cookieStore.set(name, value, opts);
          });
        } catch {
          // Server components don't allow setting cookies — middleware handles refresh
        }
      },
    },
  });
}

/**
 * createAdminClient — bypassa RLS. Usar APENAS em route handlers/server actions
 * pra operações administrativas (Stripe webhook, admin dashboard).
 * NUNCA em client/edge públicos.
 *
 * Retorna `any` intencionalmente — tipos profundos do Database geram `never`
 * em inserts genéricos. Tipagem fica no call-site.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createAdminClient(): any {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRole) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY não configurada (server-only).");
  }
  return createServerClient<Database>(url, serviceRole, {
    cookies: {
      getAll: () => [],
      setAll: () => {},
    },
  });
}
