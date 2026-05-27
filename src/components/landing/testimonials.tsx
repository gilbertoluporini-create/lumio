"use client";

import { motion } from "framer-motion";
import { Quote } from "lucide-react";
import { Reveal, Stagger, StaggerItem } from "./motion";

type Testimonial = {
  quote: string;
  name: string;
  context: string;
  initials: string;
};

const TESTIMONIALS: Testimonial[] = [
  {
    quote:
      "Antes eu saía da aula com a mão doendo e a cabeça vazia. Agora consigo participar da discussão — quando chego em casa, o resumo já tá pronto.",
    name: "Aluna do 5º semestre",
    context: "Psicologia",
    initials: "P",
  },
  {
    quote:
      "Uso pra Processo Civil. O quiz que ele gera é melhor que metade do material que eu pagava em PDF. Sério.",
    name: "Aluno do 4º semestre",
    context: "Direito",
    initials: "D",
  },
  {
    quote:
      "Mecânica dos Sólidos é três horas de quadro. Pergunto no chat depois e ele me explica do jeito que o prof falou, não com texto de Wikipedia.",
    name: "Aluno do 5º semestre",
    context: "Engenharia Civil",
    initials: "E",
  },
];

export function Testimonials() {
  return (
    <section className="relative z-10 mx-auto max-w-6xl px-6 py-20">
      <Reveal className="mb-12 max-w-2xl">
        <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground font-medium mb-4">
          — Quem usa, recomenda —
        </p>
        <h2 className="text-3xl md:text-5xl font-semibold tracking-[-0.025em] leading-[1.02]">
          O que estudantes{" "}
          <span className="gradient-text font-bold">de verdade</span>{" "}
          tão dizendo.
        </h2>
        <p className="mt-4 text-sm text-muted-foreground">
          Nomes preservados a pedido dos usuários. Conteúdo das mensagens é real.
        </p>
      </Reveal>

      <Stagger className="grid gap-5 md:grid-cols-3">
        {TESTIMONIALS.map((t) => (
          <StaggerItem key={t.name}>
            <motion.div
              whileHover={{ y: -4 }}
              transition={{ type: "spring", stiffness: 300, damping: 22 }}
              className="relative h-full overflow-hidden rounded-2xl border border-border/60 bg-card p-7 hover:border-primary/40 hover:shadow-lg transition-colors"
            >
              <Quote className="absolute top-5 right-5 h-7 w-7 text-foreground/10" />
              <p className="text-[15px] leading-relaxed text-foreground/90">
                &ldquo;{t.quote}&rdquo;
              </p>
              <div className="mt-6 flex items-center gap-3 pt-5 border-t border-border/40">
                <div className="h-9 w-9 rounded-full bg-muted ring-2 ring-background flex items-center justify-center text-xs font-semibold text-muted-foreground tracking-wide">
                  {t.initials}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{t.name}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {t.context}
                  </p>
                </div>
                <span className="ml-auto inline-flex items-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[9px] font-mono font-medium px-2 py-0.5 uppercase tracking-wider">
                  Verificado
                </span>
              </div>
            </motion.div>
          </StaggerItem>
        ))}
      </Stagger>
    </section>
  );
}
