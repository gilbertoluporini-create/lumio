"use client";

import type { User } from "./types";
import { isSupabaseConfigured, createClient } from "./supabase/client";
import {
  getCurrentUser as getLocalUser,
  signOut as localSignOut,
  updateCurrentUser as updateLocalUser,
} from "./storage";

/**
 * Auth unificado: usa Supabase quando configurado, senão localStorage.
 * Mantém a mesma interface de User pra compatibilidade.
 */

export async function getCurrentUserAsync(): Promise<User | null> {
  if (!isSupabaseConfigured()) return getLocalUser();
  const supabase = createClient();

  // getUser() faz chamada de rede e, com rotação de refresh token ligada, pode
  // falhar momentaneamente numa corrida de refresh. Um único retry evita
  // deslogar o usuário (= bounce pro /login) por causa de um tropeço transitório.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const {
        data: { user: authUser },
        error,
      } = await supabase.auth.getUser();
      if (error) throw error;
      // Sem usuário e sem erro = sessão genuinamente ausente → manda pro login.
      if (!authUser) return null;

      const { data: profile } = await supabase
        .from("profiles")
        .select("name, onboarded_at, created_at, is_ambassador")
        .eq("id", authUser.id)
        .single();
      const p = profile as
        | {
            name: string | null;
            onboarded_at: string | null;
            created_at: string;
            is_ambassador: boolean | null;
          }
        | null;
      return {
        id: authUser.id,
        email: authUser.email ?? "",
        name: p?.name ?? authUser.email?.split("@")[0] ?? "Estudante",
        createdAt: p?.created_at ?? authUser.created_at,
        onboardedAt: p?.onboarded_at ?? null,
        isAmbassador: p?.is_ambassador === true,
      };
    } catch (err) {
      if (attempt === 0) {
        await new Promise((r) => setTimeout(r, 350));
        continue;
      }
      console.error("[auth] getCurrentUserAsync falhou após retry", err);
      return getLocalUser();
    }
  }
  return getLocalUser();
}

export async function markOnboardedAsync(): Promise<void> {
  const now = new Date().toISOString();
  if (isSupabaseConfigured()) {
    try {
      const supabase = createClient();
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();
      if (authUser) {
        await supabase
          .from("profiles")
          .update({ onboarded_at: now })
          .eq("id", authUser.id);
        return;
      }
    } catch (err) {
      console.error("[auth] markOnboardedAsync failed", err);
    }
  }
  updateLocalUser({ onboardedAt: now });
}

export async function signOutAsync(): Promise<void> {
  if (isSupabaseConfigured()) {
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
    } catch (err) {
      console.error("[auth] signOut failed", err);
    }
  }
  localSignOut();
}
