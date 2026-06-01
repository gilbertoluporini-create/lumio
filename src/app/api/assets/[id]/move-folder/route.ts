import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PATCH /api/assets/[id]/move-folder
 *   body: { folderId: string | null }
 *
 * Move um `lecture_assets` (flashcards/quiz/mapa) pra uma pasta dentro da
 * matéria atual da aula de origem. Assets não têm subject_id próprio — herdam
 * via lecture, então só o folder_id muda aqui.
 *
 * Auth: sessão do usuário (RLS protege, mas validamos user_id explicitamente
 * pra retornar 404 ao invés de "row not found" cru).
 *
 * Depende da coluna `lecture_assets.folder_id` (migration 041, em paralelo).
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "ID ausente." }, { status: 400 });
  }

  let body: { folderId?: string | null } = {};
  try {
    body = (await req.json()) as { folderId?: string | null };
  } catch {
    return NextResponse.json({ error: "Body inválido." }, { status: 400 });
  }
  const folderId = body.folderId ?? null;
  if (folderId !== null && typeof folderId !== "string") {
    return NextResponse.json(
      { error: "folderId deve ser string ou null." },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Update via cliente da sessão — RLS exige user_id match. Filtro explícito
  // pra que o `count` reflita "asset existe e é do user" — distingue 404 de
  // bug genérico do Postgrest.
  const { data, error } = await supabase
    .from("lecture_assets")
    .update({ folder_id: folderId })
    .eq("id", id)
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json(
      { error: "Asset não encontrado." },
      { status: 404 },
    );
  }

  return NextResponse.json({ ok: true });
}
