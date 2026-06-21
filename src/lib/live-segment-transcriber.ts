"use client";

/**
 * LiveSegmentTranscriber — transcrição "quase ao vivo" em qualquer navegador
 * (inclusive Safari/Firefox, onde a Web Speech API não funciona pra fala
 * contínua).
 *
 * Por que segmentos? Os chunks do MediaRecorder com `timeslice` NÃO são
 * decodificáveis isoladamente (só o primeiro carrega o header do container).
 * Então, em vez de fatiar um único recorder, gravamos SEGMENTOS completos:
 * a cada ~15s paramos o MediaRecorder (gera um arquivo válido com header),
 * mandamos pro Whisper e iniciamos o próximo segmento. O texto vai "colando"
 * na tela em blocos.
 *
 * Reusa o MediaStream do AudioRecorder principal (um único getUserMedia).
 * É best-effort: qualquer falha cai no `onError` e NÃO derruba a gravação —
 * o fallback de transcrição no stop (Whisper do áudio inteiro) ainda cobre.
 */

const SEGMENT_MS_DEFAULT = 15_000;
const MIN_SEGMENT_BYTES = 2_000; // ignora trechos minúsculos/silêncio

const MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4;codecs=mp4a.40.2",
  "audio/mp4",
] as const;

function pickSegmentMime(): string {
  if (typeof MediaRecorder === "undefined") return "";
  for (const mime of MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return "";
}

export type LiveSegmentTranscriberOptions = {
  lectureId: string;
  stream: MediaStream;
  /** Duração de cada segmento em ms (default 15s). */
  segmentMs?: number;
  /** Recebe o texto transcrito de cada segmento (já aparado). */
  onText: (text: string) => void;
  /** Erros best-effort (não fatais). */
  onError?: (err: unknown) => void;
};

export class LiveSegmentTranscriber {
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private timer: number | null = null;
  private running = false;
  private mime = "";

  constructor(private opts: LiveSegmentTranscriberOptions) {}

  start(): void {
    if (this.running) return;
    if (typeof MediaRecorder === "undefined") return;
    this.running = true;
    this.mime = pickSegmentMime();
    this.beginSegment();
  }

  private beginSegment(): void {
    if (!this.running) return;
    this.chunks = [];
    try {
      this.recorder = this.mime
        ? new MediaRecorder(this.opts.stream, { mimeType: this.mime })
        : new MediaRecorder(this.opts.stream);
    } catch (err) {
      this.running = false;
      this.opts.onError?.(err);
      return;
    }

    this.recorder.ondataavailable = (e: BlobEvent) => {
      if (e.data && e.data.size > 0) this.chunks.push(e.data);
    };
    this.recorder.onstop = () => {
      const blob = new Blob(this.chunks, { type: this.mime || "audio/webm" });
      void this.flush(blob);
      // Inicia o próximo segmento imediatamente (se ainda gravando).
      if (this.running) this.beginSegment();
    };

    try {
      this.recorder.start();
    } catch (err) {
      this.running = false;
      this.opts.onError?.(err);
      return;
    }

    const ms = this.opts.segmentMs ?? SEGMENT_MS_DEFAULT;
    this.timer = window.setTimeout(() => {
      if (this.recorder && this.recorder.state === "recording") {
        try {
          this.recorder.stop();
        } catch {
          /* onstop cuida do resto */
        }
      }
    }, ms);
  }

  private async flush(blob: Blob): Promise<void> {
    if (!blob || blob.size < MIN_SEGMENT_BYTES) return;
    try {
      const res = await fetch(
        `/api/lectures/${this.opts.lectureId}/transcribe-live`,
        {
          method: "POST",
          headers: { "content-type": blob.type || "audio/webm" },
          body: blob,
        },
      );
      if (!res.ok) return;
      const data = (await res.json()) as { text?: string };
      const text = (data.text ?? "").trim();
      if (text) this.opts.onText(text);
    } catch (err) {
      this.opts.onError?.(err);
    }
  }

  /**
   * Para a captura. O segmento em andamento ainda é enviado (captura o final
   * da fala), mas nenhum novo segmento começa.
   */
  stop(): void {
    this.running = false;
    if (this.timer) {
      window.clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.recorder && this.recorder.state === "recording") {
      try {
        this.recorder.stop(); // dispara onstop → flush do último trecho
      } catch {
        /* noop */
      }
    }
  }
}
