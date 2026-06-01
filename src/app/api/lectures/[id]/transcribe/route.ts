import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { logAndSanitize } from "@/lib/api-security";
import { transcribeAudioBuffer } from "@/lib/transcribe-audio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Áudio em chunks de 10min paralelos: 1h → ~2 min, 2h → ~4 min.
// Vercel Pro permite até 800s. Subido de 300→800 em 2026-06-01 após uma
// aula de 46min travar em 86% (lecture 43cf4e10) — Whisper completou os
// chunks mas o UPDATE final foi cortado.
export const maxDuration = 800;

const STORAGE_BUCKET = "lectures-audio";

/**
 * POST /api/lectures/[id]/transcribe
 *
 * Body: { storagePath: string, filename?: string }
 *
 * Flow:
 *  1. valida ownership da lecture
 *  2. marca transcription_status = 'transcribing'
 *  3. baixa o arquivo do Supabase Storage (signed url interno via admin)
 *  4. splita + transcreve via OpenAI Whisper (lib transcribe-audio)
 *  5. salva transcript + entries + duração + status = 'completed'
 *
 * Em erro: marca 'failed' + transcription_error e retorna 500.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "lecture id required" }, { status: 400 });
  }

  let body: { storagePath?: string; filename?: string };
  try {
    body = (await req.json()) as { storagePath?: string; filename?: string };
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }
  if (!body.storagePath || typeof body.storagePath !== "string") {
    return NextResponse.json(
      { error: "storagePath é obrigatório." },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Faça login." }, { status: 401 });
  }

  const admin = createAdminClient();

  // Ownership check + pega estado atual
  const { data: lecture, error: lecErr } = await admin
    .from("lectures")
    .select("id, user_id, transcription_status, source")
    .eq("id", id)
    .maybeSingle();
  if (lecErr) {
    return NextResponse.json({ error: lecErr.message }, { status: 500 });
  }
  if (!lecture) {
    return NextResponse.json({ error: "Aula não encontrada." }, { status: 404 });
  }
  const lec = lecture as {
    id: string;
    user_id: string;
    transcription_status: string;
    source: string;
  };
  if (lec.user_id !== user.id) {
    return NextResponse.json({ error: "Sem acesso." }, { status: 403 });
  }

  // Storage path tem que ser do próprio user (sandbox por user_id)
  if (!body.storagePath.startsWith(`${user.id}/`)) {
    return NextResponse.json(
      { error: "storagePath fora do escopo do usuário." },
      { status: 403 },
    );
  }

  // Reentrância: se já está transcrevendo, recusa.
  if (lec.transcription_status === "transcribing") {
    return NextResponse.json(
      { error: "Transcrição já em andamento." },
      { status: 409 },
    );
  }

  // Marca como transcribing
  await admin
    .from("lectures")
    .update({
      transcription_status: "transcribing",
      transcription_progress: 0,
      transcription_error: null,
      source: "upload",
      status: "live",
    })
    .eq("id", id);

  let progressFlushAt = 0;
  const onProgress = async (pct: number) => {
    // Reduz writes — só atualiza a cada 5%
    if (pct < progressFlushAt + 5 && pct < 100) return;
    progressFlushAt = pct;
    await admin
      .from("lectures")
      .update({ transcription_progress: Math.min(99, pct) })
      .eq("id", id);
  };

  try {
    // Download do áudio (service role bypassa RLS)
    const { data: download, error: dlErr } = await admin.storage
      .from(STORAGE_BUCKET)
      .download(body.storagePath);
    if (dlErr || !download) {
      throw new Error(
        dlErr?.message ?? "Não consegui baixar o áudio do storage.",
      );
    }

    const arrayBuffer = await download.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const filename = body.filename || body.storagePath.split("/").pop() || "audio.bin";

    const result = await transcribeAudioBuffer(buffer, filename, {
      onProgress,
    });

    // URL pública do áudio (mesmo padrão do live)
    const { data: pub } = admin.storage.from(STORAGE_BUCKET).getPublicUrl(body.storagePath);
    const audioUrl = pub?.publicUrl ?? null;

    const { error: updErr } = await admin
      .from("lectures")
      .update({
        transcript: result.transcript,
        transcript_entries: result.entries,
        duration_sec: result.durationSec,
        status: "completed",
        transcription_status: "completed",
        transcription_progress: 100,
        transcription_error: null,
        audio_url: audioUrl,
      })
      .eq("id", id);

    if (updErr) throw new Error(updErr.message);

    return NextResponse.json({
      ok: true,
      durationSec: result.durationSec,
      entriesCount: result.entries.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Falha desconhecida.";
    console.error("[lectures/transcribe] failed", err);
    await admin
      .from("lectures")
      .update({
        transcription_status: "failed",
        transcription_error: message.slice(0, 500),
      })
      .eq("id", id);
    return NextResponse.json(
      logAndSanitize("api/lectures/[id]/transcribe", err),
      { status: 500 },
    );
  }
}
