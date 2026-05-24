"use client";

import { Play, Link as LinkIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TranscriptEntry, TranscriptMarker } from "@/lib/types";

const MARKER_STYLE: Record<TranscriptMarker, { dot: string; label: string }> = {
  concept: { dot: "bg-violet-500", label: "Conceito-chave" },
  doubt: { dot: "bg-amber-500", label: "Dúvida" },
  example: { dot: "bg-emerald-500", label: "Exemplo" },
};

function formatTs(sec: number): string {
  const total = Math.max(0, Math.floor(sec));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) {
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function highlight(text: string, terms: string[]): React.ReactNode {
  if (!terms.length) return text;
  const escaped = terms
    .filter((t) => t.length >= 3)
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (escaped.length === 0) return text;
  const re = new RegExp(`(${escaped.join("|")})`, "gi");
  const parts = text.split(re);
  return parts.map((p, i) => {
    if (i % 2 === 1) {
      return (
        <mark
          key={i}
          className="bg-violet-100 dark:bg-violet-500/20 text-violet-700 dark:text-violet-200 rounded px-1"
        >
          {p}
        </mark>
      );
    }
    return <span key={i}>{p}</span>;
  });
}

export function TranscriptEntryRow({
  entry,
  isActive,
  keyTerms,
  hasAudio,
  onPlay,
  onJumpToSlide,
}: {
  entry: TranscriptEntry;
  isActive: boolean;
  keyTerms: string[];
  hasAudio: boolean;
  onPlay?: (offsetSec: number) => void;
  onJumpToSlide?: (idx: number) => void;
}) {
  const marker = entry.marker ? MARKER_STYLE[entry.marker] : null;
  const speakerLabel =
    entry.speaker === "professor"
      ? "Prof."
      : entry.speaker === "student"
        ? "Aluno"
        : "Outro";
  const speakerClass =
    entry.speaker === "professor"
      ? "bg-violet-500/10 text-violet-700 dark:text-violet-300"
      : "bg-muted text-muted-foreground";

  return (
    <div
      className={cn(
        "flex gap-3 rounded-md px-3 py-2.5 transition-colors",
        isActive ? "bg-primary/5 border-l-4 border-primary" : "border-l-4 border-transparent",
      )}
    >
      <div className="flex flex-col items-center gap-1 pt-0.5 shrink-0">
        {hasAudio && onPlay && (
          <button
            onClick={() => onPlay(entry.audioOffsetSec ?? entry.startSec)}
            className="h-6 w-6 rounded-full border border-border/60 bg-background flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
            aria-label="Tocar trecho"
          >
            <Play className="h-3 w-3 fill-current" />
          </button>
        )}
        <span
          className={cn(
            "h-2 w-2 rounded-full",
            marker ? marker.dot : "bg-muted-foreground/30",
          )}
          title={marker?.label}
        />
        <span className="font-mono text-[10px] text-muted-foreground/80 tabular-nums">
          {formatTs(entry.startSec)}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-1.5 mb-1">
          <span
            className={cn(
              "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium",
              speakerClass,
            )}
          >
            {speakerLabel}
          </span>
          {marker && (
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium",
                entry.marker === "concept" && "bg-violet-500/10 text-violet-700 dark:text-violet-300",
                entry.marker === "doubt" && "bg-amber-500/10 text-amber-700 dark:text-amber-300",
                entry.marker === "example" && "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
              )}
            >
              {marker.label}
            </span>
          )}
          {typeof entry.slideIndex === "number" && onJumpToSlide && (
            <button
              onClick={() => onJumpToSlide(entry.slideIndex as number)}
              className="ml-auto inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20 transition-colors"
            >
              Slide {entry.slideIndex + 1}
              <LinkIcon className="h-2.5 w-2.5" />
            </button>
          )}
        </div>
        <p className="text-sm leading-relaxed text-foreground">
          {highlight(entry.text, keyTerms)}
        </p>
      </div>
    </div>
  );
}
