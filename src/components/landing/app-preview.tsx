"use client";

import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { Bot, Mic, Pause } from "lucide-react";
import { useRef } from "react";
import { Badge } from "@/components/ui/badge";

export function AppPreview() {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });

  const rotate = useTransform(scrollYProgress, [0, 0.5], [reduce ? 0 : 6, 0]);
  const y = useTransform(scrollYProgress, [0, 0.5], [reduce ? 0 : 40, 0]);
  const scale = useTransform(scrollYProgress, [0, 0.5], [reduce ? 1 : 0.95, 1]);

  return (
    <div ref={ref} className="relative mx-auto mt-20 max-w-5xl perspective-[1800px]">
      <motion.div
        style={{ rotateX: rotate, y, scale, transformStyle: "preserve-3d" }}
        className="rounded-2xl border border-border/80 bg-card/80 p-1 shadow-2xl backdrop-blur-xl glow-primary"
      >
        <div className="rounded-xl border border-border/40 bg-background overflow-hidden">
          {/* macOS window chrome */}
          <div className="flex items-center gap-1.5 border-b border-border/60 px-4 py-3">
            <div className="h-3 w-3 rounded-full bg-red-400/80" />
            <div className="h-3 w-3 rounded-full bg-yellow-400/80" />
            <div className="h-3 w-3 rounded-full bg-emerald-400/80" />
            <div className="ml-3 flex-1 text-center text-xs text-muted-foreground font-mono">
              lumio.app · Anatomia · Suprarrenais
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-[1.4fr_1fr] divide-y md:divide-y-0 md:divide-x divide-border/60 min-h-[420px]">
            {/* TRANSCRIPT PANEL */}
            <div className="p-6 text-left">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant="live" className="gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-red-500 pulse-dot" />
                    GRAVANDO · 14:22
                  </Badge>
                  <Badge variant="outline" className="gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-gradient-to-br from-rose-500 to-pink-500" />
                    Anatomia
                  </Badge>
                </div>
                <button className="h-7 w-7 rounded-full bg-red-500/10 border border-red-500/30 text-red-500 flex items-center justify-center">
                  <Pause className="h-3 w-3" />
                </button>
              </div>
              <h3 className="text-base font-semibold">Aula de Suprarrenais</h3>
              <div className="mt-4 space-y-3 text-sm leading-relaxed text-muted-foreground">
                <motion.p
                  initial={{ opacity: 0, y: 8 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.1, duration: 0.5 }}
                >
                  As glândulas suprarrenais são pequenas estruturas localizadas
                  sobre cada rim, no espaço retroperitoneal…
                </motion.p>
                <motion.p
                  initial={{ opacity: 0, y: 8 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.3, duration: 0.5 }}
                >
                  A suprarrenal direita tem formato <strong className="text-foreground">piramidal</strong>,
                  enquanto a esquerda apresenta formato <strong className="text-foreground">semilunar</strong>.
                  Ambas mantêm contato direto com o diafragma…
                </motion.p>
                <motion.p
                  initial={{ opacity: 0, y: 8 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.6, duration: 0.5 }}
                  className="text-foreground"
                >
                  <span className="shimmer rounded px-1">
                    Sua vascularização é feita por três artérias principais: as suprarrenais…
                  </span>
                </motion.p>
              </div>
            </div>

            {/* CHAT PANEL */}
            <div className="bg-secondary/30 p-6 text-left">
              <div className="mb-4 flex items-center gap-2">
                <Bot className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">Tire dúvidas durante a aula</span>
              </div>
              <div className="space-y-3 text-sm">
                <motion.div
                  initial={{ opacity: 0, x: 10 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.4, duration: 0.5 }}
                  className="rounded-lg bg-background border border-border/60 p-3"
                >
                  <p className="text-xs text-muted-foreground mb-1">Você</p>
                  <p>Qual a diferença de formato entre as duas?</p>
                </motion.div>
                <motion.div
                  initial={{ opacity: 0, x: -10 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.7, duration: 0.5 }}
                  className="rounded-lg bg-primary/10 border border-primary/20 p-3"
                >
                  <p className="text-xs text-primary mb-1 font-medium">Lumio</p>
                  <p>
                    A direita é <strong>piramidal</strong> e a esquerda{" "}
                    <strong>semilunar</strong> — exatamente como o professor acabou de
                    mencionar.
                  </p>
                </motion.div>
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: 1.1, duration: 0.5 }}
                  className="flex items-center gap-2 text-xs text-muted-foreground pt-1"
                >
                  <div className="flex gap-0.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary/60 pulse-dot" />
                    <span className="h-1.5 w-1.5 rounded-full bg-primary/60 pulse-dot" style={{ animationDelay: "200ms" }} />
                    <span className="h-1.5 w-1.5 rounded-full bg-primary/60 pulse-dot" style={{ animationDelay: "400ms" }} />
                  </div>
                  Lumio está acompanhando a aula…
                </motion.div>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Floating accent: mic chip */}
      <motion.div
        initial={{ opacity: 0, scale: 0.8, y: 20 }}
        whileInView={{ opacity: 1, scale: 1, y: 0 }}
        viewport={{ once: true, margin: "-100px" }}
        transition={{ delay: 0.4, duration: 0.6, type: "spring", stiffness: 200, damping: 18 }}
        className="absolute -left-6 top-1/3 hidden md:flex items-center gap-2 rounded-full bg-card border border-border/80 shadow-xl px-3 py-1.5 backdrop-blur-md"
      >
        <Mic className="h-3.5 w-3.5 text-red-500" />
        <span className="text-xs font-medium">Português detectado</span>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, scale: 0.8, y: 20 }}
        whileInView={{ opacity: 1, scale: 1, y: 0 }}
        viewport={{ once: true, margin: "-100px" }}
        transition={{ delay: 0.6, duration: 0.6, type: "spring", stiffness: 200, damping: 18 }}
        className="absolute -right-4 top-2/3 hidden md:flex items-center gap-2 rounded-full bg-card border border-border/80 shadow-xl px-3 py-1.5 backdrop-blur-md"
      >
        <span className="h-2 w-2 rounded-full bg-emerald-500" />
        <span className="text-xs font-medium">Salvo na pasta Anatomia</span>
      </motion.div>
    </div>
  );
}
