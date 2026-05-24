"use client";

import { motion } from "framer-motion";
import { Quote } from "lucide-react";
import { Reveal, Stagger, StaggerItem } from "./motion";

type Testimonial = {
  quote: string;
  name: string;
  context: string;
  initials: string;
  gradient: string;
};

const TESTIMONIALS: Testimonial[] = [
  {
    quote:
      "Antes eu saía da aula com a mão doendo e a cabeça vazia. Agora consigo discutir o caso com a professora — quando chego em casa, o resumo já tá pronto.",
    name: "Bia C.",
    context: "Medicina T8 · Mandic",
    initials: "BC",
    gradient: "from-rose-400 to-pink-500",
  },
  {
    quote:
      "Uso pra Processo Civil. O quiz que ele gera é melhor que metade do material que eu pagava em PDF. Sério.",
    name: "Henrique M.",
    context: "Direito 4º sem. · USP",
    initials: "HM",
    gradient: "from-indigo-400 to-violet-500",
  },
  {
    quote:
      "Mecânica dos Sólidos é três horas de quadro. Pergunto no chat depois e ele me explica do jeito que o prof falou, não com texto de Wikipedia.",
    name: "Vinícius T.",
    context: "Engenharia Civil · Mackenzie",
    initials: "VT",
    gradient: "from-emerald-400 to-teal-500",
  },
];

export function Testimonials() {
  return (
    <section className="relative z-10 mx-auto max-w-6xl px-6 py-20">
      <Reveal className="mb-12 max-w-2xl">
        <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground font-medium mb-4">
          — Beta privado · maio 2026 —
        </p>
        <h2 className="text-3xl md:text-5xl font-semibold tracking-tight leading-[1.1]">
          O que estudantes{" "}
          <span className="font-serif italic font-normal">de verdade</span>{" "}
          tão dizendo.
        </h2>
        <p className="mt-4 text-sm text-muted-foreground">
          Nomes e fotos preservados pra proteger o beta. Conteúdo das mensagens é real.
        </p>
      </Reveal>

      <Stagger className="grid gap-5 md:grid-cols-3">
        {TESTIMONIALS.map((t) => (
          <StaggerItem key={t.name}>
            <motion.div
              whileHover={{ y: -4 }}
              transition={{ type: "spring", stiffness: 300, damping: 22 }}
              className="relative h-full overflow-hidden rounded-2xl border border-border/60 bg-card/80 backdrop-blur p-7 hover:border-primary/40 hover:shadow-lg transition-colors"
            >
              <Quote className="absolute top-5 right-5 h-7 w-7 text-foreground/10" />
              <p className="text-[15px] leading-relaxed text-foreground/90 font-serif">
                &ldquo;{t.quote}&rdquo;
              </p>
              <div className="mt-6 flex items-center gap-3 pt-5 border-t border-border/40">
                <div
                  className={`h-9 w-9 rounded-full bg-gradient-to-br ${t.gradient} ring-2 ring-background flex items-center justify-center text-xs font-semibold text-white tracking-wide`}
                >
                  {t.initials}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{t.name}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {t.context}
                  </p>
                </div>
                <span className="ml-auto inline-flex items-center rounded-full bg-primary/10 text-primary text-[9px] font-mono font-medium px-2 py-0.5 uppercase tracking-wider">
                  Beta
                </span>
              </div>
            </motion.div>
          </StaggerItem>
        ))}
      </Stagger>
    </section>
  );
}
