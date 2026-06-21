"use client";

/**
 * AudioRecorder — wrapper sobre MediaRecorder com chunks + export como Blob.
 *
 * Roda em paralelo com a Web Speech API: enquanto o Speech transcreve, este
 * recorder captura o áudio real bruto pra subir no Supabase Storage depois.
 *
 * Fallback gracioso:
 *  - Se navegador não suporta MediaRecorder ou getUserMedia falha (permissão
 *    negada, etc), `isSupported()` ou `start()` rejeita — caller deve seguir
 *    sem áudio (a transcrição continua funcionando).
 *
 * MIME negotiation:
 *  - Tenta `audio/webm;codecs=opus` (Chrome/Edge/Firefox/Android).
 *  - Cai pra `audio/webm` sem codec específico.
 *  - Último fallback `audio/mp4` (Safari iOS — não suporta webm).
 */

export type RecorderState = "idle" | "recording" | "paused" | "stopping";

export type AudioRecorderOptions = {
  /** Tamanho do chunk em ms. Default 1000 (chunk a cada segundo) */
  timesliceMs?: number;
  /** echoCancellation / noiseSuppression / autoGainControl (defaults true) */
  audioConstraints?: MediaTrackConstraints;
};

const MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4;codecs=mp4a.40.2",
  "audio/mp4",
] as const;

function pickMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "audio/webm";
  for (const mime of MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return "";
}

export function isAudioRecorderSupported(): boolean {
  if (typeof window === "undefined") return false;
  if (typeof MediaRecorder === "undefined") return false;
  if (!navigator.mediaDevices?.getUserMedia) return false;
  return true;
}

export class AudioRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private stream: MediaStream | null = null;
  private mimeType = "";
  state: RecorderState = "idle";

  constructor(private opts: AudioRecorderOptions = {}) {}

  /** MIME type efetivamente usado na gravação atual (vazio se nunca iniciado). */
  getMimeType(): string {
    return this.mimeType;
  }

  /**
   * Stream de áudio em uso (ou null). Permite que o transcritor por segmentos
   * (live) anexe um segundo MediaRecorder no MESMO stream — evita um segundo
   * getUserMedia (menos contenção de microfone, especialmente no Safari).
   */
  getStream(): MediaStream | null {
    return this.stream;
  }

  async start(): Promise<void> {
    if (this.state !== "idle") return;
    if (!isAudioRecorderSupported()) {
      throw new Error("Gravação de áudio não suportada neste navegador.");
    }

    const constraints: MediaTrackConstraints = {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      ...this.opts.audioConstraints,
    };

    this.stream = await navigator.mediaDevices.getUserMedia({ audio: constraints });

    const mime = pickMimeType();
    this.mimeType = mime || "audio/webm";

    try {
      this.mediaRecorder = mime
        ? new MediaRecorder(this.stream, { mimeType: mime })
        : new MediaRecorder(this.stream);
    } catch (err) {
      // Cleanup do stream se MediaRecorder falhar (mime inválido em algum browser exótico)
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
      throw err;
    }

    this.chunks = [];
    this.mediaRecorder.ondataavailable = (e: BlobEvent) => {
      if (e.data && e.data.size > 0) this.chunks.push(e.data);
    };

    const timeslice = this.opts.timesliceMs ?? 1000;
    this.mediaRecorder.start(timeslice);
    this.state = "recording";
  }

  pause(): void {
    if (!this.mediaRecorder) return;
    if (this.state !== "recording") return;
    try {
      this.mediaRecorder.pause();
      this.state = "paused";
    } catch (err) {
      console.error("[audio-recorder] pause failed", err);
    }
  }

  resume(): void {
    if (!this.mediaRecorder) return;
    if (this.state !== "paused") return;
    try {
      this.mediaRecorder.resume();
      this.state = "recording";
    } catch (err) {
      console.error("[audio-recorder] resume failed", err);
    }
  }

  /**
   * Para a gravação e retorna o Blob completo. Resolve quando o último
   * chunk chegou (onstop dispara depois do stop()).
   *
   * Se nunca iniciou, resolve com Blob vazio.
   */
  async stop(): Promise<Blob> {
    return new Promise((resolve) => {
      if (!this.mediaRecorder || this.state === "idle") {
        this.cleanup();
        resolve(new Blob());
        return;
      }
      const recorder = this.mediaRecorder;
      const mime = this.mimeType || "audio/webm";
      recorder.onstop = () => {
        const blob = new Blob(this.chunks, { type: mime });
        this.cleanup();
        resolve(blob);
      };
      this.state = "stopping";
      try {
        recorder.stop();
      } catch (err) {
        console.error("[audio-recorder] stop failed", err);
        const blob = new Blob(this.chunks, { type: mime });
        this.cleanup();
        resolve(blob);
      }
    });
  }

  /** Aborta sem retornar blob — descarta chunks e libera o mic. */
  abort(): void {
    if (this.mediaRecorder && this.state !== "idle") {
      try {
        this.mediaRecorder.stop();
      } catch {
        /* noop */
      }
    }
    this.chunks = [];
    this.cleanup();
  }

  private cleanup(): void {
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    this.mediaRecorder = null;
    this.state = "idle";
  }
}
