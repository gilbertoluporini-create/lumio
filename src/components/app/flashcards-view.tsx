"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Eye, EyeOff, RotateCw } from "lucide-react";
import { LumiIcon } from "@/components/brand/lumi-icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type Flashcard = {
  question: string;
  answer: string;
  hint?: string;
  difficulty?: "easy" | "medium" | "hard";
};

export type FlashcardsAsset = {
  generatedAt: string;
  cards: Flashcard[];
};

const DIFF_LABEL: Record<NonNullable<Flashcard["difficulty"]>, string> = {
  easy: "Fácil",
  medium: "Médio",
  hard: "Difícil",
};

const DIFF_COLOR: Record<NonNullable<Flashcard["difficulty"]>, string> = {
  easy: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  medium: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  hard: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
};

export function FlashcardsView({ asset }: { asset: FlashcardsAsset }) {
  const [idx, setIdx] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const total = asset.cards.length;

  // Keyboard shortcuts: ←/→ navega, Space/Enter flipa, H mostra hint
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        next();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        prev();
      } else if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        setShowAnswer((v) => !v);
      } else if (e.key === "h" || e.key === "H") {
        setShowHint((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, total]);

  function next() {
    setIdx((i) => Math.min(i + 1, total - 1));
    setShowAnswer(false);
    setShowHint(false);
  }
  function prev() {
    setIdx((i) => Math.max(i - 1, 0));
    setShowAnswer(false);
    setShowHint(false);
  }
  function reset() {
    setIdx(0);
    setShowAnswer(false);
    setShowHint(false);
  }

  if (total === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border/60 bg-card/40 px-8 py-12 text-center">
        <p className="text-sm text-muted-foreground">
          Nenhum flash card disponível.
        </p>
      </div>
    );
  }

  const card = asset.cards[idx];
  const progress = ((idx + 1) / total) * 100;

  return (
    <div className="space-y-4">
      {/* Progress */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-primary to-fuchsia-500 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className="text-xs font-mono text-muted-foreground tabular-nums shrink-0">
          {idx + 1} / {total}
        </span>
      </div>

      {/* Card */}
      <div
        className={cn(
          "relative rounded-2xl border-2 transition-all min-h-[280px] flex flex-col",
          showAnswer
            ? "border-primary/50 bg-gradient-to-br from-primary/5 via-card to-fuchsia-500/5"
            : "border-border/70 bg-card",
        )}
      >
        <div className="flex items-start justify-between p-5 pb-3">
          <Badge variant="outline" className="gap-1.5 text-[10px]">
            <LumiIcon name="layers" size={14} /> Flash card
          </Badge>
          {card.difficulty && (
            <Badge
              variant="secondary"
              className={cn(
                "text-[10px] border-0",
                DIFF_COLOR[card.difficulty],
              )}
            >
              {DIFF_LABEL[card.difficulty]}
            </Badge>
          )}
        </div>

        <div className="flex-1 flex flex-col items-center justify-center px-8 py-6 text-center">
          {!showAnswer ? (
            <>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-3">
                Pergunta
              </p>
              <p className="text-xl md:text-2xl font-semibold leading-snug max-w-2xl">
                {card.question}
              </p>
              {card.hint && showHint && (
                <p className="mt-5 text-sm text-muted-foreground italic max-w-xl">
                  💡 {card.hint}
                </p>
              )}
            </>
          ) : (
            <>
              <p className="text-[10px] uppercase tracking-wider text-primary mb-3">
                Resposta
              </p>
              <p className="text-lg md:text-xl leading-relaxed max-w-2xl">
                {card.answer}
              </p>
            </>
          )}
        </div>

        <div className="border-t border-border/40 px-5 py-3 flex items-center justify-between gap-2">
          <div className="text-[10px] text-muted-foreground font-mono hidden sm:block">
            ← → navegar · espaço flipa · h pista
          </div>
          {!showAnswer && card.hint && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowHint((v) => !v)}
              className="text-xs"
            >
              {showHint ? (
                <>
                  <EyeOff className="h-3.5 w-3.5" /> Esconder pista
                </>
              ) : (
                <>
                  <Eye className="h-3.5 w-3.5" /> Mostrar pista
                </>
              )}
            </Button>
          )}
          <Button
            variant={showAnswer ? "outline" : "gradient"}
            size="sm"
            onClick={() => setShowAnswer((v) => !v)}
            className="ml-auto"
          >
            {showAnswer ? "Voltar à pergunta" : "Revelar resposta"}
          </Button>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={prev}
          disabled={idx === 0}
        >
          <ChevronLeft className="h-4 w-4" /> Anterior
        </Button>
        <Button variant="ghost" size="sm" onClick={reset} className="text-xs">
          <RotateCw className="h-3.5 w-3.5" /> Recomeçar
        </Button>
        <Button
          variant={idx === total - 1 ? "outline" : "default"}
          size="sm"
          onClick={next}
          disabled={idx === total - 1}
        >
          Próximo <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
