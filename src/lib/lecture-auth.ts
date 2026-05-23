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
      .select("id, user_id")
      .eq("id", lectureId)
      .maybeSingle();
    if (!data) return false;
    const row = data as { user_id: string };
    return row.user_id === userId;
  } catch {
    return false;
  }
}
