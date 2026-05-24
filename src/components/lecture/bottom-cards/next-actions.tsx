"use client";

import { createElement } from "react";
import { Brain, FileText, HelpCircle, Layers, Loader2, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export type NextActionId = "summary" | "flashcards" | "quiz" | "mindmap";

const ACTIONS: { id: NextActionId; label: string; icon: LucideIcon; color: string }[] = [
  { id: "summary", label: "Gerar resumo", icon: FileText, color: "text-violet-500" },
  { id: "flashcards", label: "Criar flashcards", icon: Layers, color: "text-emerald-500" },
  { id: "quiz", label: "Gerar quiz", icon: HelpCircle, color: "text-amber-500" },
  { id: "mindmap", label: "Mapa mental", icon: Brain, color: "text-rose-500" },
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
    <div className="rounded-2xl border border-border/60 bg-card p-5">
      <h3 className="text-sm font-semibold mb-3">Próximas ações</h3>
      <div className="grid grid-cols-2 gap-2">
        {ACTIONS.map((a) => {
          const isLoading = loading === a.id;
          return (
            <Button
              key={a.id}
              variant="outline"
              size="sm"
              className="justify-start h-10 text-xs"
              disabled={disabled || isLoading || !!loading}
              onClick={() => onAction(a.id)}
            >
              {isLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                createElement(a.icon, { className: `h-3.5 w-3.5 ${a.color}` })
              )}
              {a.label}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
