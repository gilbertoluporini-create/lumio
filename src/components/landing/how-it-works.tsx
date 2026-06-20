"use client";
import { LumiImg } from "@/components/brand/lumi";

import { motion } from "framer-motion";
import { Reveal, Stagger, StaggerItem } from "./motion";
import { Highlighter } from "./highlighter";

type Step = {
  n: string;
  title: string;
  desc: string;
  illustration: string;
  alt: string;
  meta: string;
};

const STEPS: Step[] = [
  {
    n: "01",
    title: "Aperta gravar na sala",
    desc: "Abre o app, escolhe a matéria e clica em gravar. Pode deixar o celular no banco do lado — funciona com mic do PC também.",
    illustration: "/illustrations/lumi-recording.png",
    alt: "Lumi gravando uma aula com microfone",
    meta: "1 clique",
  },
  {
    n: "02",
    title: "Transcrição em tempo real",
    desc: "Texto aparece linha por linha enquanto o professor fala. Você fecha o caderno e volta a olhar pra frente.",
    illustration: "/illustrations/lumi-thinking.png",
    alt: "Lumi pensando enquanto acompanha a aula",
    meta: "Tempo real",
  },
  {
    n: "03",
    title: "Pergunta o que cê quiser",
    desc: "Travou num conceito? Pergunta no chat, ainda durante a aula. O Lumi responde com base no que o professor acabou de falar.",
    illustration: "/illustrations/lumi-studying.png",
    alt: "Lumi estudando e respondendo perguntas",
    meta: "Chat IA",
  },
  {
    n: "04",
    title: "Vira resumo, flash card, quiz",
    desc: "No fim da aula, gera o que precisar. Material organizado por matéria, pronto pra revisão na véspera da prova.",
    illustration: "/illustrations/lumi-generating.png",
    alt: "Lumi gerando resumos e materiais de estudo",
    meta: "Acaba a aula",
  },
];

export function HowItWorks() {
  return (
    <section id="how" className="relative z-10 mx-auto max-w-6xl px-6 py-20">
      <Reveal className="mb-14 max-w-2xl mx-auto text-center">
        <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground font-medium mb-4">
          — Como funciona —
        </p>
        <h2 className="text-3xl md:text-5xl font-semibold tracking-[-0.025em] leading-[1.02]">
          Quatro passos.{" "}
          <span className="font-bold">
            <Highlighter delay={0.3}>Zero fricção</Highlighter>
          </span>
          .
        </h2>
        <p className="mt-5 text-base text-muted-foreground">
          Da primeira gravação ao primeiro flash card em menos de uma aula.
        </p>
      </Reveal>

      <Stagger className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4" gap={0.12}>
        {STEPS.map((step, i) => (
          <StaggerItem key={step.n}>
            <motion.div
              whileHover={{ y: -6 }}
              transition={{ type: "spring", stiffness: 280, damping: 20 }}
              className="group relative h-full overflow-hidden rounded-2xl border border-border/60 bg-card p-6 hover:border-primary/40 hover:shadow-lg transition-colors"
            >
              {/* connector line - desktop only */}
              {i < STEPS.length - 1 && (
                <div className="hidden lg:block absolute top-1/3 -right-3 z-10">
                  <svg width="20" height="12" viewBox="0 0 20 12" fill="none">
                    <path
                      d="M0 6 L18 6 M14 2 L18 6 L14 10"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      className="text-foreground/30"
                    />
                  </svg>
                </div>
              )}

              <div className="flex items-start justify-between mb-2">
                <span className="editorial-num text-5xl text-foreground/12 select-none leading-none">
                  {step.n}
                </span>
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground/80 font-mono mt-2">
                  {step.meta}
                </span>
              </div>

              <div className="relative h-32 -mx-2 mb-3 flex items-center justify-center">
                <LumiImg
                  src={step.illustration}
                  alt={step.alt}
                  width={120}
                  height={120}
                  unoptimized
                  className="relative z-10 object-contain transition-transform group-hover:scale-105"
                  draggable={false}
                />
              </div>

              <h3 className="font-semibold text-base mb-2 tracking-tight">
                {step.title}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {step.desc}
              </p>
            </motion.div>
          </StaggerItem>
        ))}
      </Stagger>
    </section>
  );
}
