/**
 * transcribe-audio — split + Whisper pipeline pra upload de áudios longos.
 *
 * Estratégia: pra evitar o limite de 25 MB da OpenAI por arquivo, splittamos
 * o áudio em chunks via ffmpeg-static, transcodando pra ogg/opus mono 24kbps
 * (mantém qualidade pra fala, comprime brutalmente — 10 min ≈ 1.8 MB).
 * Cada chunk é transcrito em paralelo via whisper-1 com timestamps por
 * segmento. Compomos os segmentos com offset de start de cada chunk.
 *
 * Não importa esse módulo no client — usa fs/child_process.
 */

import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import OpenAI from "openai";
import type { TranscriptEntry, TranscriptSpeaker } from "@/lib/types";

// @ffmpeg-installer/ffmpeg resolve o binário por arch via optional deps —
// funciona melhor em Vercel/serverless do que ffmpeg-static.
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";

const FFMPEG = ffmpegInstaller?.path || "ffmpeg";

const CHUNK_SECONDS = 600; // 10 min por chunk → ~1.8MB ogg/opus 24kbps mono
const WHISPER_MODEL = "whisper-1";
const MAX_PARALLEL = 3;

type WhisperSegment = {
  start: number;
  end: number;
  text: string;
};

type WhisperResponse = {
  text?: string;
  segments?: WhisperSegment[];
  duration?: number;
};

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

function runFfmpeg(args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(FFMPEG, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (b) => {
      stdout += b.toString();
    });
    proc.stderr.on("data", (b) => {
      stderr += b.toString();
    });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`ffmpeg exit ${code}: ${stderr.slice(-500)}`));
    });
  });
}

/**
 * Detecta duração total em segundos via ffmpeg (lê metadado).
 * Fallback: se não conseguir parsear, retorna 0.
 */
async function probeDuration(filePath: string): Promise<number> {
  try {
    const { stderr } = await runFfmpeg(["-i", filePath, "-f", "null", "-"]);
    const match = stderr.match(/Duration:\s*(\d{2}):(\d{2}):(\d{2})\.(\d+)/);
    if (!match) return 0;
    const h = parseInt(match[1], 10);
    const m = parseInt(match[2], 10);
    const s = parseInt(match[3], 10);
    const cs = parseInt(match[4].slice(0, 2), 10);
    return h * 3600 + m * 60 + s + cs / 100;
  } catch {
    return 0;
  }
}

/**
 * Splita o input em chunks ogg/opus mono 24kbps.
 * Retorna os paths dos chunks gerados.
 */
async function splitToChunks(
  inputPath: string,
  outDir: string,
): Promise<string[]> {
  const pattern = path.join(outDir, "chunk_%05d.ogg");
  await runFfmpeg([
    "-y",
    "-i",
    inputPath,
    "-ac",
    "1",
    "-ar",
    "16000",
    "-c:a",
    "libopus",
    "-b:a",
    "24k",
    "-f",
    "segment",
    "-segment_time",
    String(CHUNK_SECONDS),
    "-reset_timestamps",
    "1",
    pattern,
  ]);

  const files = await readdir(outDir);
  return files
    .filter((f) => f.startsWith("chunk_") && f.endsWith(".ogg"))
    .sort()
    .map((f) => path.join(outDir, f));
}

async function transcribeChunk(
  client: OpenAI,
  filePath: string,
  offsetSec: number,
): Promise<{ segments: WhisperSegment[]; text: string }> {
  const buf = await readFile(filePath);
  const blob = new Blob([new Uint8Array(buf)], { type: "audio/ogg" });
  const file = new File([blob], path.basename(filePath), {
    type: "audio/ogg",
  });

  const resp = (await client.audio.transcriptions.create({
    file,
    model: WHISPER_MODEL,
    response_format: "verbose_json",
    timestamp_granularities: ["segment"],
    language: "pt",
  })) as unknown as WhisperResponse;

  const text = resp.text ?? "";
  const segs = (resp.segments ?? []).map((s) => ({
    start: s.start + offsetSec,
    end: s.end + offsetSec,
    text: s.text.trim(),
  }));

  return { segments: segs, text };
}

/**
 * Roda promessas em "pool" com paralelismo limitado.
 */
async function pool<T, R>(
  items: T[],
  worker: (item: T, index: number) => Promise<R>,
  limit: number,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await worker(items[i], i);
    }
  });
  await Promise.all(runners);
  return results;
}

export type TranscribeResult = {
  transcript: string;
  entries: TranscriptEntry[];
  durationSec: number;
};

export type TranscribeOptions = {
  /** Callback opcional pra reportar progresso (0..100) */
  onProgress?: (pct: number) => void | Promise<void>;
};

/**
 * Transcreve um Buffer de áudio. Cria diretório temporário, splita,
 * transcreve em paralelo e compõe. Limpa o tmp ao final (best-effort).
 */
export async function transcribeAudioBuffer(
  audioBuffer: Buffer,
  filename: string,
  opts: TranscribeOptions = {},
): Promise<TranscribeResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY não configurada no servidor.");
  }
  const client = new OpenAI({ apiKey });

  const work = await mkdtemp(path.join(tmpdir(), `lumio-tx-${uid()}-`));
  const ext = path.extname(filename) || ".bin";
  const inputPath = path.join(work, `input${ext}`);
  const chunksDir = path.join(work, "chunks");

  try {
    console.log("[transcribe] ffmpeg path:", FFMPEG);
    console.log("[transcribe] tmp work:", work, "input size:", audioBuffer.length);

    await writeFile(inputPath, audioBuffer);
    await import("node:fs/promises").then((fs) => fs.mkdir(chunksDir));

    const totalSec = await probeDuration(inputPath);
    console.log("[transcribe] probed duration sec:", totalSec);
    await opts.onProgress?.(5);

    const chunkPaths = await splitToChunks(inputPath, chunksDir);
    console.log("[transcribe] chunks produced:", chunkPaths.length);
    if (chunkPaths.length === 0) {
      throw new Error("Não conseguimos dividir o arquivo de áudio.");
    }
    await opts.onProgress?.(15);

    // Transcreve em paralelo controlado. Reporta progresso à medida que termina.
    let done = 0;
    const chunkResults = await pool(
      chunkPaths,
      async (chunkPath, index) => {
        const offset = index * CHUNK_SECONDS;
        const result = await transcribeChunk(client, chunkPath, offset);
        done += 1;
        const pct = 15 + Math.round((done / chunkPaths.length) * 80);
        await opts.onProgress?.(pct);
        return result;
      },
      MAX_PARALLEL,
    );

    // Compõe segmentos finais → TranscriptEntry
    const entries: TranscriptEntry[] = [];
    const textChunks: string[] = [];
    for (const r of chunkResults) {
      textChunks.push(r.text);
      for (const seg of r.segments) {
        if (!seg.text) continue;
        entries.push({
          id: `up-${uid()}`,
          startSec: Math.max(0, seg.start),
          endSec: Math.max(seg.start, seg.end),
          speaker: "professor" as TranscriptSpeaker,
          text: seg.text,
          audioOffsetSec: Math.max(0, seg.start),
        });
      }
    }

    const transcript = textChunks
      .map((t) => t.trim())
      .filter(Boolean)
      .join("\n\n");

    const durationSec = totalSec || (entries.at(-1)?.endSec ?? 0);

    await opts.onProgress?.(100);

    return {
      transcript,
      entries,
      durationSec: Math.round(durationSec),
    };
  } finally {
    // Cleanup best-effort
    try {
      await rm(work, { recursive: true, force: true });
    } catch (err) {
      console.warn("[transcribe-audio] tmp cleanup falhou", err);
    }
  }
}
