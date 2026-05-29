"use client";

import { cn, stripMarkdownToPlainText } from "@/lib/utils";

const PALETTE = [
  "bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/20",
  "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20",
  "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20",
  "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/20",
  "bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/20",
  "bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300 border-fuchsia-500/20",
];

export function KeyPointsCard({
  terms,
  activeTerm,
  onSelectTerm,
}: {
  terms: string[];
  activeTerm?: string;
  onSelectTerm?: (term: string) => void;
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-5">
      <h3 className="text-sm font-semibold mb-3">Pontos-chave detectados</h3>
      {terms.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Os pontos-chave aparecem aqui conforme a aula avança.
        </p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {terms.map((t, i) => (
            <button
              key={t + i}
              onClick={() => onSelectTerm?.(t)}
              className={cn(
                "rounded-md border px-2 py-1 text-[11px] font-medium transition-all",
                PALETTE[i % PALETTE.length],
                activeTerm === t && "ring-2 ring-offset-1 ring-offset-card ring-current",
              )}
            >
              {stripMarkdownToPlainText(t)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
