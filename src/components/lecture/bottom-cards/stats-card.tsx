"use client";

import { createElement } from "react";
import { Clock, FileQuestion, Files, Mic, type LucideIcon } from "lucide-react";
import { formatDuration } from "@/lib/utils";

type Stat = {
  icon: LucideIcon;
  label: string;
  value: string;
  color: string;
};

export function StatsCard({
  slidesCount,
  durationSec,
  transcribedPct,
  doubtsCount,
}: {
  slidesCount: number;
  durationSec: number;
  transcribedPct: number;
  doubtsCount: number;
}) {
  const stats: Stat[] = [
    { icon: Files, label: "Slides", value: String(slidesCount), color: "text-violet-500" },
    { icon: Clock, label: "Duração", value: formatDuration(durationSec), color: "text-emerald-500" },
    { icon: Mic, label: "Transcrito", value: `${Math.min(100, Math.max(0, Math.round(transcribedPct)))}%`, color: "text-amber-500" },
    { icon: FileQuestion, label: "Dúvidas", value: String(doubtsCount), color: "text-rose-500" },
  ];

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-5">
      <h3 className="text-sm font-semibold mb-3">Estatísticas da aula</h3>
      <div className="grid grid-cols-4 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="text-center">
            <div className={`mx-auto mb-1.5 h-8 w-8 rounded-lg bg-secondary/40 flex items-center justify-center ${s.color}`}>
              {createElement(s.icon, { className: "h-4 w-4" })}
            </div>
            <div className="text-base font-semibold tabular-nums">{s.value}</div>
            <div className="text-[10px] text-muted-foreground">{s.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
