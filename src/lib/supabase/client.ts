"use client";

import { createBrowserClient } from "@supabase/ssr";
import { getSharedCookieDomain } from "./cookie-domain";
import type { Database } from "./types";

/**
 * Retorna `any` intencionalmente — tipos profundos do supabase-js geram
 * `never` em inserts/updates genéricos sem types gerados via CLI.
 * A tipagem fica nos call-sites com cast explícito.
 *
 * Cookies precisam ser cross-subdomain em prod (Domain=.lumioapp.net) pra que
 * o PKCE code_verifier setado pelo signInWithOAuth no www.lumioapp.net seja
 * legível pelo /auth/callback no mesmo domínio E em admin.lumioapp.net.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createClient(): any {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    throw new Error(
      "Supabase não configurado. Adicione NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY em .env.local",
    );
  }
  const host = typeof window !== "undefined" ? window.location.host : "";
  const sharedDomain = getSharedCookieDomain(host);
  return createBrowserClient<Database>(url, anon, {
    auth: {
      flowType: "pkce",
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
    ...(sharedDomain
      ? {
          cookieOptions: {
            domain: sharedDomain,
            sameSite: "lax",
            secure: true,
            path: "/",
          },
        }
      : {}),
  });
}

export function isSupabaseConfigured(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}
