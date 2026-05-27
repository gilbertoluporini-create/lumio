"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Sparkles } from "lucide-react";

type Msg = { role: "you" | "lumi"; text: string };

const SCRIPT: Msg[] = [
  { role: "you", text: "ele citou um exame pra detectar a doença, qual era?" },
  { role: "lumi", text: "Tomografia com contraste. Mencionou aos 12min." },
  { role: "you", text: "tá no slide?" },
  { role: "lumi", text: "Sim, slide 18 — destacado em vermelho." },
];

export function LumiChatMock({ className }: { className?: string }) {
  const reduce = useReducedMotion();
  const [visible, setVisible] = useState(reduce ? SCRIPT.length : 0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (reduce) return;
    if (paused) return;
    if (visible >= SCRIPT.length) {
      const t = setTimeout(() => setVisible(0), 3500);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setVisible((v) => v + 1), 1400);
    return () => clearTimeout(t);
  }, [visible, paused, reduce]);

  return (
    <div
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className={`relative rounded-2xl border border-border/60 bg-card p-5 shadow-md ${className ?? ""}`}
    >
      <div className="flex items-center gap-2 mb-4 pb-3 border-b border-border/40">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-primary to-violet-500">
          <Sparkles className="h-3.5 w-3.5 text-white" />
        </div>
        <div>
          <p className="text-xs font-semibold tracking-tight">Chat com o Lumi</p>
          <p className="text-[10px] text-muted-foreground font-mono">
            durante a aula · contexto vivo
          </p>
        </div>
        <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-medium px-2 py-0.5">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 pulse-dot" />
          online
        </span>
      </div>

      <div className="space-y-2.5 min-h-[180px]">
        {SCRIPT.slice(0, visible).map((m, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.32 }}
            className={`flex ${m.role === "you" ? "justify-end" : "justify-start"}`}
          >
            {m.role === "lumi" && (
              <div className="mr-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-violet-500">
                <Sparkles className="h-3 w-3 text-white" />
              </div>
            )}
            <div
              className={`max-w-[80%] rounded-2xl px-3 py-2 text-xs leading-snug ${
                m.role === "you"
                  ? "rounded-br-sm bg-primary text-primary-foreground"
                  : "rounded-bl-sm bg-secondary text-foreground"
              }`}
            >
              {m.text}
            </div>
          </motion.div>
        ))}
        {!reduce && visible < SCRIPT.length && (
          <div className="flex items-center gap-1.5 pl-8">
            <span className="h-1.5 w-1.5 rounded-full bg-foreground/40 animate-bounce [animation-delay:-0.3s]" />
            <span className="h-1.5 w-1.5 rounded-full bg-foreground/40 animate-bounce [animation-delay:-0.15s]" />
            <span className="h-1.5 w-1.5 rounded-full bg-foreground/40 animate-bounce" />
          </div>
        )}
      </div>
    </div>
  );
}
