"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AudioLines, Loader2, RefreshCcw, AlertCircle } from "lucide-react";
import { toast } from "sonner";

type StatusResp = {
  status: "pending" | "transcribing" | "completed" | "failed";
  progress: number;
  error: string | null;
  source: "live" | "upload";
};

export type TranscribingOverlayProps = {
  lectureId: string;
  /** Disparado quando o status sai do estado transcribing e nessa hora a lecture deve ser recarregada. */
  onCompleted?: () => void;
};

const POLL_INTERVAL_MS = 4_000;

export function TranscribingOverlay({
  lectureId,
  onCompleted,
}: TranscribingOverlayProps) {
  const router = useRouter();
  const [state, setState] = useState<StatusResp | null>(null);
  const [retrying, setRetrying] = useState(false);
  const completedFiredRef = useRef(false);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function tick() {
      try {
        const res = await fetch(`/api/lectures/${lectureId}/status`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as StatusResp;
        if (!alive) return;
        setState(data);

        if (data.status === "completed" && !completedFiredRef.current) {
          completedFiredRef.current = true;
          toast.success("Transcrição concluída.");
          // dá tempo pro toast aparecer antes do reload
          setTimeout(() => {
            if (!alive) return;
            onCompleted?.();
            router.refresh();
            // fallback hard se router.refresh não recarregar componente
            setTimeout(() => {
              if (typeof window !== "undefined") window.location.reload();
            }, 800);
          }, 500);
          return;
        }
      } catch {
        // silencioso, tenta de novo
      } finally {
        if (alive) {
          timer = setTimeout(tick, POLL_INTERVAL_MS);
        }
      }
    }

    void tick();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lectureId]);

  async function retry() {
    if (retrying) return;
    setRetrying(true);
    try {
      // tenta reabrir o ticket — endpoint já lida com idempotência
      // Não temos storagePath aqui, então o user precisa subir o áudio de novo.
      toast.message(
        "Pra tentar de novo, suba o áudio novamente pelo dashboard.",
      );
      router.push("/dashboard");
    } finally {
      setRetrying(false);
    }
  }

  if (!state) {
    return null;
  }

  if (state.status === "completed") {
    return null;
  }

  const isFailed = state.status === "failed";
  const progress = Math.max(2, Math.min(100, state.progress || 0));

  return (
    <div className="fixed inset-x-0 bottom-0 top-[57px] z-30 flex items-center justify-center bg-background/95 backdrop-blur-sm md:top-[64px]">
      <div className="w-full max-w-md px-6 text-center">
        <div className="mx-auto mb-5 inline-flex h-16 w-16 items-center justify-center rounded-full bg-primary/15 text-primary">
          {isFailed ? (
            <AlertCircle className="h-7 w-7" />
          ) : (
            <AudioLines className="h-7 w-7 animate-pulse" />
          )}
        </div>

        <h2 className="text-2xl heading-display">
          {isFailed
            ? "Algo deu errado."
            : state.status === "pending"
              ? "Preparando transcrição…"
              : "Transcrevendo seu áudio…"}
        </h2>

        <p className="mt-2 text-sm text-muted-foreground">
          {isFailed
            ? state.error ?? "Não conseguimos transcrever esse áudio."
            : "Pode levar alguns minutos pra áudios longos. Pode fechar essa aba — a transcrição continua rodando no servidor."}
        </p>

        {!isFailed && (
          <>
            <div className="mt-6 h-2 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full bg-gradient-to-r from-primary to-fuchsia-600 transition-all duration-700"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-mono text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              {progress}%
            </p>
          </>
        )}

        {isFailed && (
          <button
            onClick={retry}
            disabled={retrying}
            className="mt-6 inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-4 py-2 text-sm hover:bg-secondary disabled:opacity-50"
          >
            <RefreshCcw className="h-3.5 w-3.5" />
            Voltar ao dashboard
          </button>
        )}
      </div>
    </div>
  );
}
