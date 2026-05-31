"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Upload, AudioLines, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { createLectureAsync } from "@/lib/db";

const STORAGE_BUCKET = "lectures-audio";
const MAX_BYTES = 500 * 1024 * 1024; // 500 MB — cabe ~3h MP3 128kbps ou ~6h em 64kbps
const ACCEPTED_MIME = [
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/m4a",
  "audio/x-m4a",
  "audio/wav",
  "audio/wave",
  "audio/x-wav",
  "audio/webm",
  "audio/ogg",
  "audio/aac",
  "audio/flac",
];

function prettyBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function extOf(filename: string, mime: string): string {
  const m = filename.match(/\.([a-z0-9]+)$/i);
  if (m) return m[1].toLowerCase();
  if (mime.includes("mpeg") || mime.includes("mp3")) return "mp3";
  if (mime.includes("mp4") || mime.includes("m4a")) return "m4a";
  if (mime.includes("wav")) return "wav";
  if (mime.includes("webm")) return "webm";
  if (mime.includes("ogg")) return "ogg";
  return "bin";
}

/**
 * Normaliza variantes de MIME (audio/x-*, audio/wave, etc) pros tipos canônicos
 * aceitos por buckets Supabase com whitelist. M4A vindo do macOS chega como
 * audio/x-m4a — bucket geralmente só aceita audio/mp4.
 *
 * Arquivos .mp4 (gravados como vídeo mas com áudio extraível pelo Whisper)
 * chegam como video/mp4 — convertemos pra audio/mp4 pra o bucket aceitar.
 * Idem video/webm e video/quicktime (gravações de tela com áudio).
 */
function normalizeMime(mime: string, filename: string): string {
  const m = (mime || "").toLowerCase();
  if (m === "audio/x-m4a" || m === "audio/m4a") return "audio/mp4";
  if (m === "audio/x-wav" || m === "audio/wave") return "audio/wav";
  if (m === "audio/x-aac") return "audio/aac";
  if (m === "audio/x-flac") return "audio/flac";
  if (m === "audio/mp3") return "audio/mpeg";
  // Vídeo com trilha de áudio — Whisper aceita os mesmos containers.
  if (m === "video/mp4" || m === "video/quicktime") return "audio/mp4";
  if (m === "video/webm") return "audio/webm";
  if (m) return m;
  // sem mime: deduz pela extensão
  const ext = filename.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";
  if (ext === "m4a" || ext === "mp4" || ext === "mov") return "audio/mp4";
  if (ext === "mp3") return "audio/mpeg";
  if (ext === "wav") return "audio/wav";
  if (ext === "ogg") return "audio/ogg";
  if (ext === "webm") return "audio/webm";
  if (ext === "aac") return "audio/aac";
  if (ext === "flac") return "audio/flac";
  return "application/octet-stream";
}

function shortName(name: string, max = 48): string {
  if (name.length <= max) return name;
  const dot = name.lastIndexOf(".");
  if (dot < 0 || dot < name.length - 8) return name.slice(0, max - 1) + "…";
  const ext = name.slice(dot);
  const stem = name.slice(0, max - 1 - ext.length);
  return `${stem}…${ext}`;
}

export type UploadAudioCardProps = {
  userId: string;
  subjectId: string | null;
  fallbackTitle: string;
  /** Chamado quando upload + dispatch terminaram com sucesso e estamos prontos pra navegar. */
  onSuccess?: (lectureId: string) => void;
};

export function UploadAudioCard({
  userId,
  subjectId,
  fallbackTitle,
  onSuccess,
}: UploadAudioCardProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [progress, setProgress] = useState(0);
  const [pending, setPending] = useState<"idle" | "creating" | "uploading" | "dispatching">("idle");

  const isBusy = pending !== "idle";

  const handleSelect = useCallback((f: File | null) => {
    if (!f) {
      setFile(null);
      return;
    }
    const mimeOk =
      ACCEPTED_MIME.includes(f.type) ||
      /\.(mp3|m4a|wav|webm|ogg|aac|flac|mp4|mov)$/i.test(f.name);
    if (!mimeOk) {
      toast.error("Formato não suportado. Envie MP3, M4A, WAV, OGG ou WEBM.");
      return;
    }
    if (f.size > MAX_BYTES) {
      toast.error(
        `Arquivo grande demais (${prettyBytes(f.size)}). Limite ${prettyBytes(MAX_BYTES)}.`,
      );
      return;
    }
    setFile(f);
  }, []);

  async function handleSubmit() {
    if (!file) return;
    if (!subjectId) {
      toast.error("Escolha uma matéria primeiro.");
      return;
    }
    if (!isSupabaseConfigured()) {
      toast.error("Supabase não configurado — upload indisponível.");
      return;
    }

    try {
      // 1) cria a lecture (rate limit + monthly check já existem nessa rota)
      setPending("creating");
      const title = fallbackTitle.trim() || `Áudio ${new Date().toLocaleDateString("pt-BR")}`;
      // source: "upload" → lecture nasce com transcription_status='pending'
      // pro TranscribingOverlay aparecer assim que abrir /lecture/[id].
      const lecture = await createLectureAsync(userId, {
        subjectId,
        title,
        source: "upload",
      });

      // 2) upload pro storage (lectures-audio/<userId>/<lectureId>.<ext>)
      setPending("uploading");
      setProgress(5);
      const ext = extOf(file.name, file.type);
      const storagePath = `${userId}/${lecture.id}.${ext}`;

      const supabase = createClient();
      const contentType = normalizeMime(file.type, file.name);
      // Cria novo Blob com mime normalizado — algumas validações do Supabase
      // Storage inspecionam o type do File diretamente (ignorando o param
      // contentType) e rejeitam audio/x-m4a apesar do bucket aceitar audio/mp4.
      const normalizedBlob = new Blob([file], { type: contentType });
      const { error: upErr } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(storagePath, normalizedBlob, {
          upsert: true,
          contentType,
          cacheControl: "3600",
        });
      if (upErr) {
        throw new Error(`Upload falhou: ${upErr.message}`);
      }
      setProgress(60);

      // 3) dispara transcribe (server fica processando)
      setPending("dispatching");
      // NOTA: a rota leva alguns minutos. Não esperamos a resposta aqui —
      // pegamos só o "kickoff" 202; a UI da lecture faz polling do status.
      void fetch(`/api/lectures/${lecture.id}/transcribe`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ storagePath, filename: file.name }),
        keepalive: true,
      }).catch((err) => {
        console.error("[upload-audio] dispatch failed", err);
      });

      setProgress(100);
      toast.success("Áudio recebido. A transcrição começou.");

      onSuccess?.(lecture.id);
      router.push(`/lecture/${lecture.id}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro desconhecido";
      toast.error(msg);
      setPending("idle");
      setProgress(0);
    }
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    if (isBusy) return;
    const f = e.dataTransfer.files?.[0];
    if (f) handleSelect(f);
  }

  return (
    <div className="w-full min-w-0 space-y-3">
      <div
        onClick={() => !isBusy && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          if (!isBusy) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={cn(
          "group relative w-full max-w-full cursor-pointer overflow-hidden rounded-xl border-2 border-dashed p-5 text-center transition-colors",
          dragOver
            ? "border-primary bg-primary/5"
            : "border-border/60 hover:border-primary/60 hover:bg-secondary/30",
          isBusy && "pointer-events-none opacity-60",
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept="audio/*,video/mp4,video/quicktime,video/webm,.mp3,.m4a,.wav,.ogg,.webm,.aac,.flac,.mp4,.mov"
          className="hidden"
          onChange={(e) => handleSelect(e.target.files?.[0] ?? null)}
        />
        {file ? (
          <div className="flex w-full min-w-0 items-center justify-between gap-3 text-left">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                <AudioLines className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1 overflow-hidden">
                <p className="truncate text-sm font-medium" title={file.name}>
                  {shortName(file.name)}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {prettyBytes(file.size)}
                  {file.type && ` · ${file.type}`}
                </p>
              </div>
            </div>
            {!isBusy && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setFile(null);
                }}
                aria-label="Remover arquivo"
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 py-2">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-secondary text-primary group-hover:bg-primary/10">
              <Upload className="h-5 w-5" />
            </span>
            <p className="text-sm font-medium">
              Arraste um áudio aqui ou clique pra escolher
            </p>
            <p className="text-xs text-muted-foreground">
              MP3, M4A, WAV, OGG, WEBM — até {prettyBytes(MAX_BYTES)} (~3h)
            </p>
          </div>
        )}
      </div>

      {isBusy && (
        <div>
          <div className="h-1.5 w-full rounded-full bg-secondary overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="mt-1.5 text-[11px] text-muted-foreground text-center font-mono">
            {pending === "creating" && "Criando aula…"}
            {pending === "uploading" && "Subindo áudio…"}
            {pending === "dispatching" && "Disparando transcrição…"}
          </p>
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={!file || isBusy || !subjectId}
        className={cn(
          "inline-flex w-full items-center justify-center gap-2 rounded-md bg-gradient-to-r from-primary to-fuchsia-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-opacity",
          (!file || !subjectId) && "opacity-40 cursor-not-allowed",
          isBusy && "opacity-70 cursor-wait",
        )}
      >
        {isBusy ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Processando…
          </>
        ) : (
          <>
            <Upload className="h-4 w-4" />
            Enviar áudio
          </>
        )}
      </button>
    </div>
  );
}
