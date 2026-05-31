/**
 * Helpers de autorização — verifica ownership antes de operações sensíveis.
 */

import { createAdminClient } from "./supabase/server";

/**
 * Verifica se a lecture pertence ao userId. Bypass-RLS via admin client porque
 * estamos em route handler já autenticado.
 */
export async function assertLectureOwnership(
  userId: string,
  lectureId: string,
): Promise<boolean> {
  if (!userId || !lectureId) return false;
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("lectures")
      .select("id, user_id, deleted_at")
      .eq("id", lectureId)
      .maybeSingle();
    if (!data) return false;
    const row = data as { user_id: string; deleted_at: string | null };
    // Aulas soft-deletadas não devem aceitar operações (gerar resumo,
    // transcrever, anexar slides etc) — só restore/permanent-delete vão
    // direto no DB sem passar por essa checagem.
    if (row.deleted_at) return false;
    return row.user_id === userId;
  } catch {
    return false;
  }
}
