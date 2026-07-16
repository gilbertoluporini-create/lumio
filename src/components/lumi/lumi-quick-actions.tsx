"use client";

import { Edit3, FileText, Globe, Layers, Lightbulb } from "lucide-react";
import { COIN_COSTS } from "@/lib/coin-costs";
import { cn } from "@/lib/utils";

// Ações "explicar" e "inglês médico" caem no chat contextual (1 coin/msg),
// não geram asset pago. As demais disparam geração paga (COIN_COSTS).
const CHAT_CONTEXTUAL_COST = 1;

export type QuickAction = {
  id: "summary" | "flashcards" | "english" | "explain" | "quiz";
  label: string;
  cost: number;
  description: string;
  Icon: typeof FileText;
  tone: string;
};

export const QUICK_ACTIONS: QuickAction[] = [
  {
    id: "summary",
    label: "Gerar resumo",
    cost: COIN_COSTS.summary,
    description: "Resumo estruturado do contexto",
    Icon: FileText,
    tone: "text-violet-600 bg-violet-500/10",
  },
  {
    id: "flashcards",
    label: "Criar flashcards",
    cost: COIN_COSTS.flashcards,
    description: "Deck de revisão SRS",
    Icon: Layers,
    tone: "text-fuchsia-600 bg-fuchsia-500/10",
  },
  {
    id: "english",
    label: "Modo inglês médico",
    cost: CHAT_CONTEXTUAL_COST,
    description: "Explicações em English",
    Icon: Globe,
    tone: "text-sky-600 bg-sky-500/10",
  },
  {
    id: "explain",
    label: "Explicar conceito",
    cost: CHAT_CONTEXTUAL_COST,
    description: "Quebrar um termo difícil",
    Icon: Lightbulb,
    tone: "text-amber-600 bg-amber-500/10",
  },
  {
    id: "quiz",
    label: "Gerar quiz",
    cost: COIN_COSTS.quiz,
    description: "Questões de prática",
    Icon: Edit3,
    tone: "text-emerald-600 bg-emerald-500/10",
  },
];

type Props = {
  onPick: (action: QuickAction) => void;
  disabled?: boolean;
};

export function LumiQuickActions({ onPick, disabled }: Props) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
      {QUICK_ACTIONS.map((a) => (
        <button
          key={a.id}
          type="button"
          onClick={() => onPick(a)}
          disabled={disabled}
          className={cn(
            "group flex flex-col items-start gap-2 rounded-2xl border border-border/60 bg-card p-4 text-left transition-all",
            "hover:border-primary/40 hover:-translate-y-0.5 hover:shadow-md hover:shadow-primary/5",
            "disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-none",
          )}
        >
          <div
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-xl",
              a.tone,
            )}
          >
            <a.Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold leading-tight text-foreground">
              {a.label}
            </div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">
              {a.description}
            </div>
          </div>
          <div className="mt-auto inline-flex items-center gap-1 text-[11px] font-medium text-amber-600">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500" />
            {a.cost} coins
          </div>
        </button>
      ))}
    </div>
  );
}
