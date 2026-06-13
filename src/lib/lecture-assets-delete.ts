"use client";

import { createClient } from "@/lib/supabase/client";

/**
 * Apaga uma row em `lecture_assets` (flashcards/quiz/mindmap/summary).
 * Idempotente (RLS confere ownership). Não toca em lecture nem em
 * summaries — só no asset gerado.
 */
export async function deleteLectureAssetAsync(
  userId: string,
  assetId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = createClient();
  // Soft-delete (consistente com summaries, migration 017) — preserva o
  // "recuperar/regerar" do Lumi e da lixeira.
  const { error } = await supabase
    .from("lecture_assets")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", assetId)
    .eq("user_id", userId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
