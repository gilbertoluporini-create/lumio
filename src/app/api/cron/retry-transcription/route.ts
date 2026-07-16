/**
 * GET /api/cron/retry-transcription
 *
 * Re-dispara transcrições TRAVADAS. transcribe é fire-and-forget; se a função
 * Vercel estoura/crasha, a aula fica presa em 'transcribing'/'failed' e o user
 * perdia o progresso (tinha que re-subir o áudio). Este cron varre as travadas
 * e chama o transcribe de novo (dispatch interno via x-internal-key).
 *
 * Critério de "travada":
 *   - transcription_status IN ('transcribing','failed')
 *   - transcription_started_at < now() - 15min (deu tempo de terminar)
 *   - transcription_attempts < MAX_ATTEMPTS (não loopa infinito)
 *   - storage_path NOT NULL (precisa do áudio pra retry)
 *   - deleted_at IS NULL
 *
 * Auth: x-internal-key timing-safe vs CRON_SECRET (+ Bearer do Vercel Cron).
 * Resposta: { processed, retried, skipped }
 */
import { NextResponse, type NextRequest, after } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_ATTEMPTS = 3;
const STUCK_AFTER_MIN = 15;
const BATCH = 5; // máx aulas re-disparadas por execução (evita avalanche)

function safeEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

function isAuthorized(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET ?? "";
  if (!expected) return process.env.NODE_ENV !== "production";
  const internal = req.headers.get("x-internal-key") ?? "";
  if (internal && safeEq(internal, expected)) return true;
  const auth = req.headers.get("authorization") ?? "";
  return auth === `Bearer ${expected}`;
}

function baseUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  }
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

type StuckRow = {
  id: string;
  storage_path: string | null;
  transcription_attempts: number;
};

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const cronSecret = process.env.CRON_SECRET ?? "";
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET ausente" }, { status: 500 });
  }

  const admin = createAdminClient();
  const cutoff = new Date(Date.now() - STUCK_AFTER_MIN * 60_000).toISOString();

  const { data, error } = await admin
    .from("lectures")
    .select("id, storage_path, transcription_attempts")
    .in("transcription_status", ["transcribing", "failed"])
    .lt("transcription_started_at", cutoff)
    .lt("transcription_attempts", MAX_ATTEMPTS)
    .not("storage_path", "is", null)
    .is("deleted_at", null)
    .order("transcription_started_at", { ascending: true })
    .limit(BATCH);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const stuck = (data ?? []) as StuckRow[];
  let retried = 0;

  for (const lec of stuck) {
    if (!lec.storage_path) continue;
    const storagePath = lec.storage_path;
    const nextAttempts = (lec.transcription_attempts ?? 0) + 1;

    // O transcribe roda como invocação própria (maxDuration dele). O disparo
    // vai num after() pra que o waitUntil do runtime segure o sandbox até o
    // fetch SAIR de fato — sem isso, `void fetch` + retorno da rota congelava o
    // serverless e podia matar o request antes de disparar, queimando attempts
    // à toa. Só incrementa attempts DEPOIS que o disparo aconteceu (fetch
    // resolveu). Se o dispatch falhar (rejeição/HTTP erro), NÃO conta a
    // tentativa — a aula segue elegível pro próximo tick.
    after(async () => {
      try {
        const resp = await fetch(
          `${baseUrl()}/api/lectures/${lec.id}/transcribe`,
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-internal-key": cronSecret,
            },
            body: JSON.stringify({ storagePath }),
          },
        );
        if (!resp.ok) {
          console.error(
            "[retry-transcription] transcribe recusou dispatch",
            lec.id,
            resp.status,
          );
          return;
        }
        await admin
          .from("lectures")
          .update({ transcription_attempts: nextAttempts })
          .eq("id", lec.id);
      } catch (err) {
        // Disparo não aconteceu (rede/abort) → não incrementa attempts.
        console.error("[retry-transcription] dispatch falhou", lec.id, err);
      }
    });
    retried++;
  }

  return NextResponse.json({
    processed: stuck.length,
    // retried = quantos foram DESPACHADOS neste tick (o incremento de attempts
    // é confirmado em background no after()).
    retried,
    skipped: stuck.length - retried,
  });
}
