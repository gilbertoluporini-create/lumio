"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";
import { Bot, Mic } from "lucide-react";

const TRANSCRIPT_PARTS = [
  "As glândulas suprarrenais são pequenas estruturas localizadas sobre cada rim, ",
  "no espaço retroperitoneal. ",
  "A suprarrenal direita tem formato piramidal, ",
  "enquanto a esquerda apresenta formato semilunar. ",
  "Ambas mantêm contato direto com o diafragma. ",
  "Sua vascularização vem de três artérias principais…",
];

const FULL_TRANSCRIPT = TRANSCRIPT_PARTS.join("");

const QUESTION = "Qual a diferença de formato entre as duas?";
const ANSWER =
  "A direita é piramidal e a esquerda semilunar, exatamente como o professor mencionou no início.";

export function LiveDemo() {
  const reduce = useReducedMotion();
  const [typed, setTyped] = useState(reduce ? FULL_TRANSCRIPT : "");
  const [phase, setPhase] = useState<"typing" | "question" | "answer" | "done">(
    reduce ? "done" : "typing",
  );
  const [questionTyped, setQuestionTyped] = useState(reduce ? QUESTION : "");
  const [answerTyped, setAnswerTyped] = useState(reduce ? ANSWER : "");

  useEffect(() => {
    if (reduce) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const run = async () => {
      // PHASE 1: typing transcript
      for (let i = 0; i <= FULL_TRANSCRIPT.length; i++) {
        if (cancelled) return;
        setTyped(FULL_TRANSCRIPT.slice(0, i));
        const ch = FULL_TRANSCRIPT[i];
        const delay = ch === "." || ch === "," ? 220 : ch === " " ? 38 : 26;
        await new Promise((r) => {
          timer = setTimeout(r, delay);
        });
      }
      if (cancelled) return;
      await new Promise((r) => {
        timer = setTimeout(r, 700);
      });

      // PHASE 2: question
      setPhase("question");
      for (let i = 0; i <= QUESTION.length; i++) {
        if (cancelled) return;
        setQuestionTyped(QUESTION.slice(0, i));
        await new Promise((r) => {
          timer = setTimeout(r, 32);
        });
      }
      if (cancelled) return;
      await new Promise((r) => {
        timer = setTimeout(r, 500);
      });

      // PHASE 3: answer
      setPhase("answer");
      for (let i = 0; i <= ANSWER.length; i++) {
        if (cancelled) return;
        setAnswerTyped(ANSWER.slice(0, i));
        await new Promise((r) => {
          timer = setTimeout(r, 22);
        });
      }
      if (cancelled) return;
      setPhase("done");

      // PHASE 4: pause then restart loop
      await new Promise((r) => {
        timer = setTimeout(r, 4500);
      });
      if (cancelled) return;
      setTyped("");
      setQuestionTyped("");
      setAnswerTyped("");
      setPhase("typing");
      run();
    };

    run();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [reduce]);

  return (
    <div className="relative">
      {/* Background frame — paper-like */}
      <div className="absolute inset-0 -m-3 rounded-2xl bg-card/40 backdrop-blur-md border border-border/40 paper-texture" />
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.2, ease: "easeOut" }}
        className="relative rounded-xl border border-border/70 bg-card shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/60 px-4 py-2.5 bg-secondary/30">
          <div className="flex items-center gap-2">
            <motion.span
              className="inline-flex items-center gap-1.5 rounded-full bg-red-500/10 border border-red-500/30 px-2 py-0.5 text-[10px] font-medium text-red-600 dark:text-red-400"
              animate={{ opacity: [1, 0.5, 1] }}
              transition={{ duration: 1.6, repeat: Infinity }}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-red-500" /> AO VIVO
            </motion.span>
            <span className="text-xs text-muted-foreground font-mono">
              Anatomia · Suprarrenais
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <SoundBars active={phase === "typing"} />
          </div>
        </div>

        {/* Transcript */}
        <div className="px-5 py-5 min-h-[160px]">
          <div className="flex items-center gap-1.5 mb-2 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
            <Mic className="h-3 w-3 text-primary" /> Transcrição
          </div>
          <p className="text-sm leading-relaxed text-foreground/90">
            {typed}
            {phase === "typing" && <span className="caret" />}
          </p>
        </div>

        <div className="dotted-divider h-px" />

        {/* Chat */}
        <div className="px-5 py-4 bg-secondary/20 min-h-[140px]">
          <div className="flex items-center gap-1.5 mb-3 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
            <Bot className="h-3 w-3 text-primary" /> Pergunta durante a aula
          </div>
          <div className="space-y-2.5">
            {(phase === "question" ||
              phase === "answer" ||
              phase === "done") && (
              <div className="flex justify-end">
                <div className="max-w-[85%] rounded-lg rounded-br-sm bg-primary text-primary-foreground px-3 py-1.5 text-xs">
                  {questionTyped}
                  {phase === "question" && <span className="caret" />}
                </div>
              </div>
            )}
            {(phase === "answer" || phase === "done") && (
              <div className="flex gap-2">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-violet-500">
                  <Bot className="h-3 w-3 text-white" />
                </div>
                <div className="max-w-[85%] rounded-lg rounded-bl-sm bg-secondary text-foreground px-3 py-1.5 text-xs leading-relaxed">
                  {answerTyped}
                  {phase === "answer" && <span className="caret" />}
                </div>
              </div>
            )}
            {phase === "typing" && (
              <p className="text-xs text-muted-foreground italic">
                Lumio está acompanhando a aula…
              </p>
            )}
          </div>
        </div>
      </motion.div>

      {/* Floating annotation — like a sticky note (desktop only) */}
      <motion.div
        initial={{ opacity: 0, rotate: -8, scale: 0.9 }}
        animate={{ opacity: 1, rotate: -4, scale: 1 }}
        transition={{ delay: 0.9, duration: 0.6, type: "spring", stiffness: 180 }}
        className="hidden md:block absolute -top-6 md:-right-10 z-10 max-w-[170px] rotate-[-4deg]"
      >
        <div className="relative">
          <div className="absolute left-1/2 -top-2.5 -translate-x-1/2 w-12 h-3 rounded-sm tape" />
          <div className="rounded-md bg-amber-50 dark:bg-amber-100/90 px-3 py-2 shadow-lg border border-amber-200/50">
            <p className="text-[11px] leading-snug text-amber-950 font-serif italic">
              &ldquo;… sua resposta em <span className="highlight-marker">tempo real</span>, com base no que <em>acabou</em> de ser dito.&rdquo;
            </p>
          </div>
        </div>
      </motion.div>

      {/* Floating folder chip (desktop only) */}
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ delay: 1.2, duration: 0.6, type: "spring", stiffness: 200 }}
        className="hidden md:block absolute -bottom-4 md:-left-6 z-10"
      >
        <div className="flex items-center gap-2 rounded-full bg-card border border-border shadow-xl px-3 py-1.5 backdrop-blur">
          <span className="h-2 w-2 rounded-full bg-gradient-to-br from-rose-500 to-pink-500" />
          <span className="text-xs font-medium">Salvo na pasta Anatomia</span>
        </div>
      </motion.div>
    </div>
  );
}

function SoundBars({ active }: { active: boolean }) {
  return (
    <div className="flex items-end gap-[2px] h-3.5">
      {[0, 1, 2, 3].map((i) => (
        <motion.span
          key={i}
          className="w-[2px] rounded-full bg-primary/70"
          animate={
            active
              ? {
                  height: ["20%", "100%", "40%", "80%", "30%"],
                }
              : { height: "20%" }
          }
          transition={{
            duration: 0.9,
            repeat: active ? Infinity : 0,
            delay: i * 0.12,
            ease: "easeInOut",
          }}
          style={{ height: "20%" }}
        />
      ))}
    </div>
  );
}
