import { NextResponse, type NextRequest } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/subjects/[id]/mind-map
 * Retorna o mapa mental incremental da matéria pro user logado.
 *
 * Resposta:
 *   - 200 com `{ structure, version, last_updated_lecture_id, updated_at }`
 *     se existir.
 *   - 200 com `{ structure: { nodes: [], edges: [] }, version: 0, empty: true }`
 *     se ainda não houver mapa (primeira aula ainda pendente).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "subject id required" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Faça login." }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("subject_mind_maps")
    .select("structure, version, last_updated_lecture_id, updated_at")
    .eq("subject_id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({
      structure: { nodes: [], edges: [] },
      version: 0,
      empty: true,
    });
  }

  const row = data as {
    structure: unknown;
    version: number;
    last_updated_lecture_id: string | null;
    updated_at: string;
  };
  return NextResponse.json({
    structure: row.structure ?? { nodes: [], edges: [] },
    version: row.version,
    last_updated_lecture_id: row.last_updated_lecture_id,
    updated_at: row.updated_at,
  });
}
