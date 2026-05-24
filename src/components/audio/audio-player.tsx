"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play, Volume2, VolumeX } from "lucide-react";
import { Waveform } from "./waveform";
import { cn } from "@/lib/utils";

/**
 * AudioPlayer customizado com:
 *  - Botão play/pause
 *  - Waveform clickable pra seek
 *  - Tempo "1:23 / 5:42"
 *  - Speed control (0.75x, 1x, 1.25x, 1.5x, 2x)
 *  - Volume toggle + slider opcional
 *
 * O <audio> HTML é controlado via ref (não renderiza controles default).
 */

export type AudioPlayerProps = {
  src: string;
  /** Duração em segundos (se conhecida). Usada como hint enquanto metadata carrega. */
  initialDurationSec?: number;
  /** Compacto: sem speed/volume, só play+waveform+tempo */
  compact?: boolean;
  /** Callback opcional de tempo atual */
  onTimeUpdate?: (currentSec: number, durationSec: number) => void;
  /** Auto-play ao montar (default false). Browsers podem bloquear se user não interagiu */
  autoPlay?: boolean;
  className?: string;
};

const PLAYBACK_RATES = [0.75, 1, 1.25, 1.5, 2] as const;

function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const total = Math.floor(sec);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function AudioPlayer({
  src,
  initialDurationSec,
  compact = false,
  onTimeUpdate,
  autoPlay = false,
  className,
}: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentSec, setCurrentSec] = useState(0);
  const [durationSec, setDurationSec] = useState(initialDurationSec ?? 0);
  const [rate, setRate] = useState<number>(1);
  const [muted, setMuted] = useState(false);
  // Volume slider está reservado pra v2; por ora só mute toggle.
  const volume = 1;

  // Setup do <audio> e listeners
  useEffect(() => {
    const audio = new Audio(src);
    audio.preload = "metadata";
    audio.crossOrigin = "anonymous";
    audioRef.current = audio;

    const onLoadedMetadata = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setDurationSec(audio.duration);
      }
    };
    const onTime = () => {
      setCurrentSec(audio.currentTime);
      onTimeUpdate?.(audio.currentTime, audio.duration || 0);
    };
    const onEnd = () => {
      setPlaying(false);
      setCurrentSec(0);
      audio.currentTime = 0;
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);

    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("ended", onEnd);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);

    if (autoPlay) {
      void audio.play().catch(() => {
        /* autoplay bloqueado, ignora */
      });
    }

    return () => {
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("ended", onEnd);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.pause();
      audio.src = "";
      audioRef.current = null;
    };
  }, [src, autoPlay, onTimeUpdate]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.playbackRate = rate;
  }, [rate]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.muted = muted;
    audio.volume = volume;
  }, [muted, volume]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      void audio.play().catch((err) => {
        console.error("[audio-player] play failed", err);
      });
    } else {
      audio.pause();
    }
  }, []);

  const handleSeek = useCallback(
    (position: number) => {
      const audio = audioRef.current;
      if (!audio) return;
      const dur = audio.duration || durationSec;
      if (!Number.isFinite(dur) || dur <= 0) return;
      audio.currentTime = position * dur;
      setCurrentSec(audio.currentTime);
    },
    [durationSec],
  );

  const progress = useMemo(() => {
    if (durationSec <= 0) return 0;
    return Math.max(0, Math.min(1, currentSec / durationSec));
  }, [currentSec, durationSec]);

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg border border-border/60 bg-card/60 px-3 py-2",
        compact ? "py-1.5" : "py-2.5",
        className,
      )}
    >
      <button
        type="button"
        onClick={togglePlay}
        aria-label={playing ? "Pausar" : "Reproduzir"}
        className={cn(
          "shrink-0 inline-flex items-center justify-center rounded-full",
          "bg-primary text-primary-foreground hover:bg-primary/90 transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          compact ? "h-8 w-8" : "h-9 w-9",
        )}
      >
        {playing ? (
          <Pause className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
        ) : (
          <Play
            className={cn(
              compact ? "h-3.5 w-3.5" : "h-4 w-4",
              "translate-x-[1px]",
            )}
          />
        )}
      </button>

      <div className="flex-1 min-w-0">
        <Waveform
          src={src}
          bars={compact ? 50 : 80}
          height={compact ? 28 : 36}
          progress={progress}
          onSeek={handleSeek}
        />
      </div>

      <div className="shrink-0 text-[11px] font-mono tabular-nums text-muted-foreground whitespace-nowrap">
        {formatTime(currentSec)} / {formatTime(durationSec)}
      </div>

      {!compact && (
        <>
          <div className="shrink-0">
            <select
              value={rate}
              onChange={(e) => setRate(Number(e.target.value))}
              aria-label="Velocidade de reprodução"
              className={cn(
                "h-7 rounded-md border border-border/60 bg-background px-1.5 text-[11px]",
                "font-mono text-muted-foreground hover:text-foreground transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              )}
            >
              {PLAYBACK_RATES.map((r) => (
                <option key={r} value={r}>
                  {r}x
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={() => setMuted((m) => !m)}
            aria-label={muted ? "Ativar som" : "Silenciar"}
            className="shrink-0 inline-flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
          >
            {muted ? (
              <VolumeX className="h-3.5 w-3.5" />
            ) : (
              <Volume2 className="h-3.5 w-3.5" />
            )}
          </button>
        </>
      )}
    </div>
  );
}
