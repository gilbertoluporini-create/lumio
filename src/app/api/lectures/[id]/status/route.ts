import { NextResponse, type NextRequest } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/lectures/[id]/status
 * Polling pra UI saber se a transcrição terminou.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "lecture id required" }, { status: 400 });
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
    .from("lectures")
    .select(
      "id, user_id, transcription_status, transcription_progress, transcription_error, source",
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Aula não encontrada." }, { status: 404 });
  }
  const row = data as {
    user_id: string;
    transcription_status: string;
    transcription_progress: number;
    transcription_error: string | null;
    source: string;
  };
  if (row.user_id !== user.id) {
    return NextResponse.json({ error: "Sem acesso." }, { status: 403 });
  }

  return NextResponse.json({
    status: row.transcription_status,
    progress: row.transcription_progress,
    error: row.transcription_error,
    source: row.source,
  });
}
