"use client";

import { createElement } from "react";
import { Brain, Coins, HelpCircle, Layers, Loader2, type LucideIcon } from "lucide-react";
import { COIN_COSTS } from "@/lib/coins-pricing";

export type NextActionId = "summary" | "flashcards" | "quiz" | "mindmap";

// "summary" foi removido daqui — quick summary (/api/correlate) tinha
// qualidade ruim e confundia com o resumo educativo. Só o educativo
// (botão dedicado na aba Resumo) sobrou.
const ACTIONS: {
  id: NextActionId;
  label: string;
  icon: LucideIcon;
  color: string;
  cost: number;
}[] = [
  { id: "flashcards", label: "Criar flashcards", icon: Layers, color: "text-emerald-500", cost: COIN_COSTS.flashcards },
  { id: "quiz", label: "Gerar quiz", icon: HelpCircle, color: "text-amber-500", cost: COIN_COSTS.quiz },
  { id: "mindmap", label: "Mapa mental", icon: Brain, color: "text-rose-500", cost: COIN_COSTS.mindmap },
];

export function NextActionsCard({
  loading,
  onAction,
  disabled,
}: {
  loading?: NextActionId | null;
  onAction: (id: NextActionId) => void;
  disabled?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-5 min-w-0">
      <h3 className="text-sm font-semibold mb-3">Próximas ações</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {ACTIONS.map((a) => {
          const isLoading = loading === a.id;
          return (
            <button
              key={a.id}
              type="button"
              disabled={disabled || isLoading || !!loading}
              onClick={() => onAction(a.id)}
              className="group flex items-center gap-2 rounded-md border border-input bg-background hover:bg-secondary/50 disabled:opacity-50 disabled:cursor-not-allowed px-2.5 py-2 min-w-0 transition-colors"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin shrink-0" />
              ) : (
                createElement(a.icon, {
                  className: `h-4 w-4 shrink-0 ${a.color}`,
                })
              )}
              <div className="min-w-0 flex-1 text-left">
                <div className="text-[11px] font-medium truncate leading-tight">
                  {a.label}
                </div>
                <div className="inline-flex items-center gap-0.5 mt-0.5 text-[9px] font-mono text-amber-600 dark:text-amber-400 tabular-nums">
                  <Coins className="h-2 w-2" />
                  {a.cost}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
