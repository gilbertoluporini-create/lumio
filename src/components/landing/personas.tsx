"use client";

import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { LumiIcon, type LumiIconName } from "@/components/brand/lumi-icon";
import { Reveal, Stagger, StaggerItem } from "./motion";

type Persona = {
  icon: LumiIconName;
  badge: string;
  title: string;
  pain: string;
  solution: string;
  bg: string;
  accent: string;
};

const PERSONAS: Persona[] = [
  {
    icon: "heart",
    badge: "Medicina",
    title: "Quatro horas de Bioquímica seguidas.",
    pain: "Você copia ciclo de Krebs no caderno enquanto o professor já tá em outra via metabólica. Em casa, metade da letra não dá pra ler.",
    solution:
      "Lumio transcreve tudo, gera flash card por reação e te pergunta no quiz. Você presta atenção no slide — a anotação fica com a gente.",
    bg: "bg-gradient-to-br from-rose-500/5 via-card to-pink-500/5",
    accent: "text-rose-500",
  },
  {
    icon: "book",
    badge: "Direito",
    title: "Doutrina muda, jurisprudência muda.",
    pain: "Você precisa lembrar qual STJ falou o quê em qual ano, e o professor cita seis julgados na hora.",
    solution:
      "Pergunta no chat na hora: 'qual o número do REsp que ele citou?' O Lumio acha no texto e cola no resumo da aula.",
    bg: "bg-gradient-to-br from-indigo-500/5 via-card to-violet-500/5",
    accent: "text-indigo-500",
  },
  {
    icon: "trophy",
    badge: "Engenharia",
    title: "Fórmula na lousa, contexto no áudio.",
    pain: "A dedução tá no que o professor fala — não no slide. Você copia equação sem entender por que.",
    solution:
      "Resumo estruturado mostra cada passo da dedução em texto, do lado da fórmula original. Revisão da prova em 20min.",
    bg: "bg-gradient-to-br from-emerald-500/5 via-card to-teal-500/5",
    accent: "text-emerald-500",
  },
];

export function Personas() {
  return (
    <section
      id="for-who"
      className="relative z-10 mx-auto max-w-6xl px-6 py-20"
    >
      <Reveal className="mb-14 max-w-2xl">
        <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground font-medium mb-4">
          — Pra quem é —
        </p>
        <h2 className="text-3xl md:text-5xl font-semibold tracking-tight leading-[1.1]">
          Cada curso tem{" "}
          <span className="font-serif italic font-normal">a própria dor</span>.
        </h2>
        <p className="mt-5 text-base text-muted-foreground max-w-xl">
          A gente entendeu três delas pra valer. Se a sua não tá aqui ainda, escreve em{" "}
          <a
            href="mailto:contato@lumioapp.net"
            className="text-foreground underline underline-offset-2 decoration-foreground/30 hover:decoration-foreground transition-colors"
          >
            contato@lumioapp.net
          </a>
          .
        </p>
      </Reveal>

      <Stagger className="grid gap-5 md:grid-cols-3">
        {PERSONAS.map((p, i) => (
          <StaggerItem key={p.badge}>
            <motion.div
              whileHover={{ y: -6 }}
              transition={{ type: "spring", stiffness: 280, damping: 20 }}
              className={`group relative h-full overflow-hidden rounded-2xl border border-border/60 p-7 hover:border-primary/40 hover:shadow-xl transition-all ${p.bg}`}
            >
              <div className="flex items-center justify-between mb-5">
                <span className={`inline-flex items-center gap-1.5 rounded-full bg-background/80 backdrop-blur px-2.5 py-1 text-[11px] font-medium ${p.accent}`}>
                  <span className={`h-1.5 w-1.5 rounded-full bg-current`} />
                  {p.badge}
                </span>
                <span className="editorial-num text-3xl text-foreground/15 leading-none">
                  0{i + 1}
                </span>
              </div>

              <div className="flex items-start gap-3 mb-5">
                <LumiIcon name={p.icon} size={32} />
                <h3 className="font-semibold tracking-tight text-base leading-snug">
                  {p.title}
                </h3>
              </div>

              <div className="space-y-3">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-mono mb-1">
                    A dor
                  </p>
                  <p className="text-sm text-foreground/70 leading-relaxed">
                    {p.pain}
                  </p>
                </div>
                <div className="border-t border-border/40 pt-3">
                  <p className="text-[10px] uppercase tracking-wider text-primary/80 font-mono mb-1 inline-flex items-center gap-1">
                    O Lumio <ArrowRight className="h-2.5 w-2.5" />
                  </p>
                  <p className="text-sm text-foreground/90 leading-relaxed">
                    {p.solution}
                  </p>
                </div>
              </div>
            </motion.div>
          </StaggerItem>
        ))}
      </Stagger>
    </section>
  );
}
