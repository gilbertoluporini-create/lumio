"use client";

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { cn } from "@/lib/utils";

/**
 * Waveform — renderiza barras verticais (SVG) do áudio de uma URL ou Blob.
 *
 * Decodificação:
 *  - Carrega ArrayBuffer via fetch (URL) ou FileReader (blob).
 *  - Usa AudioContext.decodeAudioData → Float32Array dos samples.
 *  - Downsample por buckets (pega RMS) pra N barras.
 *
 * Decorativo:
 *  - Quando `src` e `blob` ausentes → gera waveform pseudo-aleatório
 *    determinístico (seed = durationSec) com label "Sem áudio".
 *
 * Click:
 *  - Se `onSeek` definido, click no SVG calcula posição 0..1 pelo X.
 */

export type WaveformProps = {
  /** URL do áudio (público ou signed). Opcional se `blob` ou `decorative` */
  src?: string;
  /** Blob direto (alternativo a src) */
  blob?: Blob;
  /** Modo decorativo: gera waveform fake determinístico baseado em seed. */
  decorative?: boolean;
  /** Seed pro modo decorativo (default 1). Use durationSec pra estabilidade. */
  seed?: number;
  /** Número de barras (default 60) */
  bars?: number;
  /** Altura em px (default 40) */
  height?: number;
  /** Cor das barras "preenchidas" — qualquer CSS color. Default usa primary. */
  color?: string;
  /** Cor das barras não preenchidas. Default usa muted. */
  inactiveColor?: string;
  /** Progress 0..1 — barras antes desse ponto ficam preenchidas. */
  progress?: number;
  /** Callback quando user clica na waveform. Recebe pos 0..1 baseada no X. */
  onSeek?: (position: number) => void;
  /** Classe extra pro container SVG */
  className?: string;
  /** Label opcional (ex: "Sem áudio") sobreposto em modo decorativo */
  label?: string;
  /** Aria-label pra acessibilidade */
  ariaLabel?: string;
};

// ============================================================================
// Decoder utils
// ============================================================================

type AudioCtxCtor = typeof AudioContext;

function getAudioCtxCtor(): AudioCtxCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    AudioContext?: AudioCtxCtor;
    webkitAudioContext?: AudioCtxCtor;
  };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

async function decodeAudioToPeaks(
  arrayBuffer: ArrayBuffer,
  bars: number,
): Promise<number[]> {
  const Ctor = getAudioCtxCtor();
  if (!Ctor) throw new Error("AudioContext indisponível");
  // OfflineAudioContext seria mais leve mas precisa de sampleRate/length —
  // como o decode é one-shot e curto, AudioContext normal serve.
  const ctx = new Ctor();
  try {
    // decodeAudioData precisa de ArrayBuffer "fresh" — clonamos pra evitar
    // detach em Safari que reusa o buffer
    const buf = arrayBuffer.slice(0);
    const audio = await ctx.decodeAudioData(buf);
    const channelData = audio.getChannelData(0); // mono / primeiro canal
    return downsampleToPeaks(channelData, bars);
  } finally {
    // Fecha o ctx pra liberar recursos (não bloqueia)
    void ctx.close().catch(() => {});
  }
}

/**
 * Downsample: divide o sinal em N buckets e pega RMS de cada um.
 * Normaliza pra 0..1 dividindo pelo pico global.
 */
function downsampleToPeaks(samples: Float32Array, bars: number): number[] {
  const bucketSize = Math.max(1, Math.floor(samples.length / bars));
  const peaks: number[] = new Array(bars);
  let globalMax = 0;
  for (let i = 0; i < bars; i++) {
    const start = i * bucketSize;
    const end = Math.min(samples.length, start + bucketSize);
    let sumSq = 0;
    let count = 0;
    for (let j = start; j < end; j++) {
      const s = samples[j];
      sumSq += s * s;
      count++;
    }
    const rms = count > 0 ? Math.sqrt(sumSq / count) : 0;
    peaks[i] = rms;
    if (rms > globalMax) globalMax = rms;
  }
  if (globalMax === 0) return peaks.map(() => 0);
  return peaks.map((p) => p / globalMax);
}

/**
 * Gerador determinístico de "waveform" fake — usa LCG pra ter mesma forma
 * com mesmo seed. Útil pra lectures sem áudio (decorativo, não vai dar
 * impressão de áudio real).
 */
function generateDecorativePeaks(bars: number, seed: number): number[] {
  let s = (seed || 1) * 9301 + 49297;
  const peaks: number[] = new Array(bars);
  for (let i = 0; i < bars; i++) {
    s = (s * 9301 + 49297) % 233280;
    const rnd = s / 233280;
    // Suaviza com envelope cossenoidal pra dar um look "natural" (decay/attack)
    const env = 0.4 + 0.6 * Math.abs(Math.sin((i / bars) * Math.PI * 3));
    peaks[i] = 0.15 + rnd * 0.85 * env;
  }
  return peaks;
}

// ============================================================================
// Cache de peaks por URL — evita re-decodificar o mesmo áudio na lista
// ============================================================================

const peaksCache = new Map<string, number[]>();

function cacheKey(src: string | undefined, bars: number): string | null {
  if (!src) return null;
  return `${src}::${bars}`;
}

// ============================================================================
// Componente
// ============================================================================

function WaveformInner(props: WaveformProps) {
  const {
    src,
    blob,
    decorative,
    seed = 1,
    bars = 60,
    height = 40,
    color,
    inactiveColor,
    progress,
    onSeek,
    className,
    label,
    ariaLabel,
  } = props;

  const [peaks, setPeaks] = useState<number[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // Modo decorativo: peaks sintéticos imediatos
  const decorativePeaks = useMemo(() => {
    if (!decorative && src) return null;
    return generateDecorativePeaks(bars, seed);
  }, [decorative, src, bars, seed]);

  useEffect(() => {
    let active = true;

    // Decorativo OU sem fonte → usa peaks fake
    if (decorative || (!src && !blob)) {
      setPeaks(decorativePeaks);
      return;
    }

    // Cache hit?
    const key = cacheKey(src, bars);
    if (key && peaksCache.has(key)) {
      setPeaks(peaksCache.get(key)!);
      return;
    }

    async function load() {
      setLoading(true);
      setError(null);
      try {
        let buf: ArrayBuffer;
        if (blob) {
          buf = await blob.arrayBuffer();
        } else if (src) {
          const res = await fetch(src);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          buf = await res.arrayBuffer();
        } else {
          return;
        }
        const result = await decodeAudioToPeaks(buf, bars);
        if (!active) return;
        if (key) peaksCache.set(key, result);
        setPeaks(result);
      } catch (err) {
        if (!active) return;
        console.error("[waveform] decode failed", err);
        setError((err as Error).message);
        // Fallback: decorativo
        setPeaks(generateDecorativePeaks(bars, seed));
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();

    return () => {
      active = false;
    };
  }, [src, blob, bars, decorative, seed, decorativePeaks]);

  const handleClick = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!onSeek) return;
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return;
      const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      onSeek(pos);
    },
    [onSeek],
  );

  const display = peaks ?? new Array(bars).fill(0);
  const isDecorative = decorative || (!src && !blob) || error !== null;

  const activeColor = color ?? "var(--color-primary, oklch(0.62 0.18 285))";
  const inactive = inactiveColor ?? "currentColor";
  // Cada barra ocupa width/bars; gap entre é uma fração da largura da barra
  const viewBoxWidth = bars * 4; // 3px bar + 1px gap virtual
  const barWidth = 3;
  const gap = 1;
  const progressClamp =
    typeof progress === "number"
      ? Math.max(0, Math.min(1, progress))
      : undefined;
  const filledBars =
    progressClamp !== undefined ? Math.round(bars * progressClamp) : bars;

  return (
    <div
      className={cn(
        "relative inline-flex items-center w-full",
        onSeek ? "cursor-pointer" : "",
        className,
      )}
      style={{ height }}
    >
      <svg
        ref={svgRef}
        viewBox={`0 0 ${viewBoxWidth} 100`}
        preserveAspectRatio="none"
        width="100%"
        height="100%"
        onClick={handleClick}
        role="img"
        aria-label={ariaLabel ?? (isDecorative ? "Forma de onda decorativa" : "Forma de onda do áudio")}
        className={cn(
          "block select-none",
          isDecorative ? "text-muted-foreground/40" : "text-muted-foreground/60",
        )}
      >
        {display.map((p, i) => {
          // mínimo de 4% pra barras vazias serem visíveis
          const amp = Math.max(0.04, p);
          const barH = amp * 90; // 90% do viewBox (deixa padding)
          const x = i * (barWidth + gap);
          const y = (100 - barH) / 2;
          const isFilled = i < filledBars;
          return (
            <rect
              key={i}
              x={x}
              y={y}
              width={barWidth}
              height={barH}
              rx={1}
              fill={isFilled ? activeColor : inactive}
              opacity={
                isDecorative ? (isFilled ? 0.45 : 0.3) : isFilled ? 1 : 0.35
              }
            />
          );
        })}
      </svg>
      {loading && !peaks && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-[10px] text-muted-foreground/60 font-mono">
            …
          </span>
        </div>
      )}
      {label && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-[10px] text-muted-foreground/70 font-medium tracking-wide uppercase">
            {label}
          </span>
        </div>
      )}
    </div>
  );
}

export const Waveform = memo(WaveformInner);
