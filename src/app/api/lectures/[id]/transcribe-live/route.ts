import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { transcribeAudioBuffer } from "@/lib/transcribe-audio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Segmentos de ~15s transcrevem em 1-3s. Cap baixo pra não segurar função.
export const maxDuration = 60;

const MAX_SEGMENT_BYTES = 8 * 1024 * 1024; // ~15s comprimido cabe folgado

function extForContentType(ct: string): string {
  const c = ct.toLowerCase();
  if (c.includes("mp4") || c.includes("m4a") || c.includes("aac")) return "mp4";
  if (c.includes("ogg")) return "ogg";
  if (c.includes("wav")) return "wav";
  if (c.includes("mpeg") || c.includes("mp3")) return "mp3";
  return "webm";
}

/**
 * POST /api/lectures/[id]/transcribe-live
 *
 * Body: bytes crus de um SEGMENTO curto de áudio (~15s), Content-Type audio/*.
 * Transcreve via Whisper e devolve { text }. Stateless — o cliente é quem
 * acumula o texto na transcrição (via sync.addFinal). Usado pela transcrição
 * quase-ao-vivo em navegadores sem Web Speech (Safari/Firefox).
 *
 * NÃO cobra coins (faz parte da gravação). Decisão de cobrança pode mudar.
 */
export async function POST(
  req: NextRequest,
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

  // Ownership check
  const { data: lecture, error: lecErr } = await admin
    .from("lectures")
    .select("id, user_id")
    .eq("id", id)
    .maybeSingle();
  if (lecErr) {
    return NextResponse.json({ error: lecErr.message }, { status: 500 });
  }
  if (!lecture) {
    return NextResponse.json({ error: "Aula não encontrada." }, { status: 404 });
  }
  if ((lecture as { user_id: string }).user_id !== user.id) {
    return NextResponse.json({ error: "Sem acesso." }, { status: 403 });
  }

  const arrayBuffer = await req.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  if (buffer.length === 0) {
    return NextResponse.json({ text: "" });
  }
  if (buffer.length > MAX_SEGMENT_BYTES) {
    return NextResponse.json(
      { error: "Segmento de áudio muito grande." },
      { status: 413 },
    );
  }

  const ext = extForContentType(req.headers.get("content-type") ?? "");
  const filename = `live-segment.${ext}`;

  try {
    const result = await transcribeAudioBuffer(buffer, filename);
    return NextResponse.json({ text: result.transcript ?? "" });
  } catch (err) {
    console.error("[transcribe-live] failed", err);
    // Best-effort: cliente ignora segmento que falhar.
    return NextResponse.json(
      { error: "Falha ao transcrever segmento." },
      { status: 500 },
    );
  }
}
