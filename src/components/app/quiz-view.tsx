"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Check, RotateCw, X } from "lucide-react";
import { LumiIcon } from "@/components/brand/lumi-icon";
import { LumiCharacter } from "@/components/brand/lumi";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type QuizQuestion = {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
};

export type QuizAsset = {
  generatedAt: string;
  questions: QuizQuestion[];
};

const LETTERS = ["A", "B", "C", "D"];

export function QuizView({ asset }: { asset: QuizAsset }) {
  const [idx, setIdx] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [answers, setAnswers] = useState<(number | null)[]>(
    new Array(asset.questions.length).fill(null),
  );
  const [finished, setFinished] = useState(false);

  const total = asset.questions.length;
  const q = asset.questions[idx];

  // Keyboard: 1-4 seleciona, Enter confirma/avança, R recomeça
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement) return;
      if (finished) return;
      if (["1", "2", "3", "4"].includes(e.key)) {
        const n = parseInt(e.key) - 1;
        if (n < q.options.length) {
          e.preventDefault();
          if (!revealed) setSelected(n);
        }
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (!revealed && selected !== null) {
          confirmAnswer();
        } else if (revealed) {
          nextQuestion();
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, revealed, finished, idx]);

  function confirmAnswer() {
    if (selected === null) return;
    setRevealed(true);
    setAnswers((prev) => {
      const next = [...prev];
      next[idx] = selected;
      return next;
    });
  }

  function nextQuestion() {
    if (idx === total - 1) {
      setFinished(true);
      return;
    }
    setIdx(idx + 1);
    setSelected(null);
    setRevealed(false);
  }

  function restart() {
    setIdx(0);
    setSelected(null);
    setRevealed(false);
    setAnswers(new Array(total).fill(null));
    setFinished(false);
  }

  const score = answers.filter(
    (a, i) => a !== null && a === asset.questions[i].correctIndex,
  ).length;
  const scorePct = Math.round((score / total) * 100);

  if (finished) {
    const message =
      scorePct === 100
        ? "Perfeito. Mande aquele print no grupo."
        : scorePct >= 80
          ? "Você dominou a aula."
          : scorePct >= 60
            ? "Sabe a maioria. Revisa o que errou."
            : scorePct >= 40
              ? "Tá começando a pegar. Faz de novo."
              : "Bora revisar pelo resumo antes.";
    const mood: "celebrating" | "studying" | "thinking" | "confused" =
      scorePct >= 80
        ? "celebrating"
        : scorePct >= 60
          ? "studying"
          : scorePct >= 40
            ? "thinking"
            : "confused";

    return (
      <div className="rounded-2xl border border-border/70 bg-gradient-to-br from-primary/5 via-card to-fuchsia-500/5 p-8 text-center">
        <div className="flex justify-center mb-3">
          <LumiCharacter mood={mood} size="lg" float />
        </div>
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">
          Resultado final
        </div>
        <div className="text-5xl md:text-6xl font-semibold font-mono tabular-nums">
          {score}<span className="text-muted-foreground">/{total}</span>
        </div>
        <div className="text-sm text-muted-foreground mt-1">
          {scorePct}% de acerto
        </div>
        <p className="mt-6 text-lg max-w-md mx-auto leading-relaxed">
          {message}
        </p>

        {/* Lista de questões com revisão */}
        <div className="mt-8 space-y-2 text-left max-w-2xl mx-auto">
          {asset.questions.map((qq, i) => {
            const userAns = answers[i];
            const correct = qq.correctIndex;
            const got = userAns === correct;
            return (
              <div
                key={i}
                className="flex items-start gap-3 rounded-lg border border-border/60 bg-card p-3"
              >
                <div
                  className={cn(
                    "h-7 w-7 shrink-0 rounded-md flex items-center justify-center text-xs font-mono font-semibold",
                    got
                      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                      : "bg-rose-500/15 text-rose-700 dark:text-rose-300",
                  )}
                >
                  {got ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium leading-snug">
                    {qq.question}
                  </p>
                  {!got && userAns !== null && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Você: {LETTERS[userAns]}) {qq.options[userAns]} · Correta:{" "}
                      {LETTERS[correct]}) {qq.options[correct]}
                    </p>
                  )}
                  {got && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {LETTERS[correct]}) {qq.options[correct]}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <Button variant="gradient" size="lg" onClick={restart} className="mt-8">
          <RotateCw className="h-4 w-4" /> Refazer quiz
        </Button>
      </div>
    );
  }

  const isCorrect = selected === q.correctIndex;
  const progress = ((idx + (revealed ? 1 : 0)) / total) * 100;

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

      {/* Question */}
      <div className="rounded-2xl border border-border/70 bg-card p-6">
        <div className="flex items-start justify-between mb-4">
          <Badge variant="outline" className="gap-1.5 text-[10px]">
            <LumiIcon name="trophy" size={14} /> Quiz
          </Badge>
          <div className="text-[10px] text-muted-foreground font-mono">
            Questão {idx + 1}
          </div>
        </div>

        <h3 className="text-lg md:text-xl font-semibold leading-snug mb-5">
          {q.question}
        </h3>

        <div className="space-y-2">
          {q.options.map((opt, i) => {
            const isSel = selected === i;
            const isCorr = i === q.correctIndex;
            const showCorrect = revealed && isCorr;
            const showWrong = revealed && isSel && !isCorr;
            return (
              <button
                key={i}
                onClick={() => !revealed && setSelected(i)}
                disabled={revealed}
                className={cn(
                  "w-full flex items-center gap-3 rounded-lg border-2 p-3.5 text-left transition-all",
                  showCorrect
                    ? "border-emerald-500/60 bg-emerald-500/10"
                    : showWrong
                      ? "border-rose-500/60 bg-rose-500/10"
                      : isSel
                        ? "border-primary/60 bg-primary/10"
                        : "border-border/60 hover:border-border/80 hover:bg-secondary/30",
                  revealed && "cursor-default",
                )}
              >
                <div
                  className={cn(
                    "h-7 w-7 shrink-0 rounded-md flex items-center justify-center text-xs font-mono font-semibold transition-colors",
                    showCorrect
                      ? "bg-emerald-500 text-white"
                      : showWrong
                        ? "bg-rose-500 text-white"
                        : isSel
                          ? "bg-primary text-white"
                          : "bg-secondary text-muted-foreground",
                  )}
                >
                  {showCorrect ? (
                    <Check className="h-4 w-4" />
                  ) : showWrong ? (
                    <X className="h-4 w-4" />
                  ) : (
                    LETTERS[i]
                  )}
                </div>
                <span className="text-sm leading-relaxed flex-1">{opt}</span>
              </button>
            );
          })}
        </div>

        {revealed && (
          <div
            className={cn(
              "mt-4 rounded-lg p-3 text-sm leading-relaxed",
              isCorrect
                ? "bg-emerald-500/10 text-emerald-900 dark:text-emerald-200"
                : "bg-amber-500/10 text-amber-900 dark:text-amber-200",
            )}
          >
            <strong>{isCorrect ? "Mandou bem." : "Quase."}</strong>{" "}
            {q.explanation}
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between gap-2">
        <div className="text-[10px] text-muted-foreground font-mono hidden sm:block">
          1-4 seleciona · enter confirma/avança
        </div>
        {!revealed ? (
          <Button
            variant="gradient"
            onClick={confirmAnswer}
            disabled={selected === null}
            className="ml-auto"
          >
            Confirmar
          </Button>
        ) : (
          <Button variant="gradient" onClick={nextQuestion} className="ml-auto">
            {idx === total - 1 ? "Ver resultado" : "Próxima"}{" "}
            <ArrowRight className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
