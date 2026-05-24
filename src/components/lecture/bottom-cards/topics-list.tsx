"use client";

import { cn, formatDuration } from "@/lib/utils";
import type { TranscriptTopic } from "@/lib/types";

const DOT: Record<TranscriptTopic["color"], string> = {
  violet: "bg-violet-500",
  emerald: "bg-emerald-500",
  amber: "bg-amber-500",
  rose: "bg-rose-500",
};

export function TopicsListCard({
  topics,
  activeStartSec,
  onSelect,
}: {
  topics: TranscriptTopic[];
  activeStartSec?: number;
  onSelect?: (startSec: number) => void;
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-5">
      <h3 className="text-sm font-semibold mb-3">Tópicos da aula</h3>
      {topics.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Os tópicos serão identificados conforme a aula avança.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {topics.map((t) => {
            const isActive = t.startSec === activeStartSec;
            return (
              <li key={t.id ?? `${t.startSec}-${t.title}`}>
                <button
                  onClick={() => onSelect?.(t.startSec)}
                  className={cn(
                    "w-full flex items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors",
                    isActive
                      ? "bg-primary/5 border-l-2 border-primary"
                      : "border-l-2 border-transparent hover:bg-secondary/40",
                  )}
                >
                  <span className={cn("h-2 w-2 rounded-full shrink-0", DOT[t.color])} />
                  <span className="text-xs flex-1 truncate">{t.title}</span>
                  <span className="font-mono text-[10px] text-muted-foreground/70 tabular-nums">
                    {formatDuration(t.startSec)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
