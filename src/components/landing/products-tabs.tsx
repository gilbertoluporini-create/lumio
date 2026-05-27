"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  CheckCircle2,
  FileText,
  Layers,
  ListChecks,
  Sparkles,
} from "lucide-react";
import { LumioCoin } from "@/components/brand/lumio-coin";

type TabKey = "resumo" | "flashcards" | "quiz" | "mapa";

const TABS: Array<{
  key: TabKey;
  label: string;
  Icon: typeof FileText;
  coins: number;
  blurb: string;
}> = [
  {
    key: "resumo",
    label: "Resumo",
    Icon: FileText,
    coins: 10,
    blurb: "Texto organizado por slide com bullets e dúvidas correlacionadas.",
  },
  {
    key: "flashcards",
    label: "Flash cards",
    Icon: Layers,
    coins: 12,
    blurb: "10 cartões pergunta-resposta com hint e dificuldade.",
  },
  {
    key: "quiz",
    label: "Quiz",
    Icon: ListChecks,
    coins: 15,
    blurb: "8 múltipla escolha com correção comentada na hora.",
  },
  {
    key: "mapa",
    label: "Mapa mental",
    Icon: Sparkles,
    coins: 20,
    blurb: "Hierarquia colorida com tema central e ramos.",
  },
];

export function ProductsTabs() {
  const [active, setActive] = useState<TabKey>("resumo");
  const tab = TABS.find((t) => t.key === active)!;

  return (
    <div className="relative overflow-hidden rounded-3xl border border-border/60 bg-card/80 p-5 md:p-7">
      <div className="flex flex-wrap items-center gap-2 mb-6">
        {TABS.map(({ key, label, Icon, coins }) => {
          const isActive = active === key;
          return (
            <button
              key={key}
              onClick={() => setActive(key)}
              className={`relative inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-medium tracking-tight transition-colors ${
                isActive
                  ? "text-primary-foreground"
                  : "text-foreground/70 hover:text-foreground"
              }`}
              aria-pressed={isActive}
            >
              {isActive && (
                <motion.span
                  layoutId="products-tab-bg"
                  className="absolute inset-0 rounded-full bg-gradient-to-br from-primary to-violet-500 shadow-md"
                  transition={{ type: "spring", stiffness: 340, damping: 30 }}
                />
              )}
              <span className="relative z-10 inline-flex items-center gap-2">
                <Icon className="h-3.5 w-3.5" />
                {label}
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-mono ${
                    isActive
                      ? "bg-white/20 text-white"
                      : "bg-primary/10 text-primary"
                  }`}
                >
                  <LumioCoin size={9} />
                  {coins}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <p className="text-sm text-muted-foreground mb-5 max-w-xl">{tab.blurb}</p>

      <div className="relative min-h-[300px] md:min-h-[360px] rounded-2xl border border-border/50 bg-background/60 overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={active}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.35, ease: [0.21, 0.47, 0.32, 0.98] }}
            className="absolute inset-0 p-5 md:p-7"
          >
            {active === "resumo" && <ResumoPreview />}
            {active === "flashcards" && <FlashcardsPreview />}
            {active === "quiz" && <QuizPreview />}
            {active === "mapa" && <MapaPreview />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

function ResumoPreview() {
  return (
    <div className="space-y-3 text-sm">
      <div className="flex items-center justify-between mb-1">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">
          Aula · 14 min · gerado em 3s
        </p>
        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary text-[10px] font-mono px-2 py-0.5">
          Resumo
        </span>
      </div>
      <h4 className="text-base font-semibold tracking-tight">
        Independência do Brasil — contexto e processo
      </h4>
      <ul className="space-y-2 pl-1">
        {[
          "Proclamada em 7 de setembro de 1822, às margens do Ipiranga.",
          "Dom Pedro I rompeu com Portugal após pressão das Cortes.",
          "Influência das revoluções liberais europeias do início do século XIX.",
          "Reconhecimento internacional em 1825, via tratado com Portugal.",
        ].map((s, i) => (
          <motion.li
            key={s}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.15 + i * 0.08 }}
            className="flex items-start gap-2 text-foreground/85"
          >
            <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
            {s}
          </motion.li>
        ))}
      </ul>
      <div className="mt-4 rounded-lg border border-border/40 bg-card/60 px-3 py-2 text-xs text-muted-foreground">
        Dúvida do chat: <span className="text-foreground/85">&ldquo;por que Dom João voltou pra Portugal?&rdquo;</span> → respondida no parágrafo 2.
      </div>
    </div>
  );
}

function FlashcardsPreview() {
  const cards = [
    { q: "Data da Independência?", a: "7 de setembro de 1822" },
    { q: "Quem proclamou?", a: "Dom Pedro I" },
    { q: "Onde foi proclamada?", a: "Riacho Ipiranga, SP" },
  ];
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-1">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">
          10 cartões · ← → pra navegar
        </p>
        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary text-[10px] font-mono px-2 py-0.5">
          Flash card 1/10
        </span>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {cards.map((c, i) => (
          <motion.div
            key={c.q}
            initial={{ opacity: 0, y: 14, rotate: i === 1 ? 0 : i === 0 ? -2 : 2 }}
            animate={{ opacity: 1, y: 0, rotate: i === 1 ? 0 : i === 0 ? -2 : 2 }}
            transition={{ delay: 0.1 + i * 0.1, type: "spring", stiffness: 200, damping: 18 }}
            whileHover={{ y: -4, rotate: 0 }}
            className="rounded-xl border border-border/50 bg-gradient-to-br from-card to-secondary/40 p-4 shadow-sm"
          >
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground/80 font-mono mb-2">
              Pergunta {i + 1}
            </p>
            <p className="text-sm font-medium leading-snug mb-3 tracking-tight">
              {c.q}
            </p>
            <div className="mt-2 rounded-md bg-primary/10 text-primary text-xs px-2 py-1.5 font-medium">
              {c.a}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function QuizPreview() {
  const options = [
    { label: "7 de setembro de 1822", correct: true },
    { label: "15 de novembro de 1889", correct: false },
    { label: "5 de outubro de 1988", correct: false },
    { label: "13 de maio de 1888", correct: false },
  ];
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-1">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">
          Questão 3 de 8 · 1-4 ou enter
        </p>
        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary text-[10px] font-mono px-2 py-0.5">
          Quiz
        </span>
      </div>
      <h4 className="text-base font-semibold tracking-tight leading-snug">
        Em que data foi proclamada a Independência do Brasil?
      </h4>
      <div className="grid gap-2">
        {options.map((o, i) => (
          <motion.div
            key={o.label}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.12 + i * 0.07 }}
            className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm ${
              o.correct
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                : "border-border/50 bg-card/60 text-foreground/75"
            }`}
          >
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-md text-[11px] font-mono ${
                o.correct
                  ? "bg-emerald-500 text-white"
                  : "bg-secondary text-muted-foreground"
              }`}
            >
              {i + 1}
            </span>
            <span className="font-medium">{o.label}</span>
            {o.correct && (
              <CheckCircle2 className="ml-auto h-4 w-4 text-emerald-500" />
            )}
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function MapaPreview() {
  const branches = [
    { label: "Data", color: "from-violet-500 to-purple-500", angle: -60 },
    { label: "Personagens", color: "from-pink-500 to-rose-500", angle: 0 },
    { label: "Causas", color: "from-amber-500 to-orange-500", angle: 60 },
    { label: "Consequências", color: "from-emerald-500 to-teal-500", angle: 120 },
    { label: "Tratados", color: "from-sky-500 to-cyan-500", angle: 180 },
    { label: "Contexto", color: "from-rose-500 to-red-500", angle: -120 },
  ];
  return (
    <div className="relative h-full min-h-[280px] flex items-center justify-center">
      <p className="absolute top-0 left-0 text-[10px] uppercase tracking-wider text-muted-foreground font-mono">
        Mapa mental
      </p>
      <motion.div
        initial={{ scale: 0.7, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.4, type: "spring", stiffness: 200 }}
        className="relative z-10 rounded-2xl bg-gradient-to-br from-primary to-violet-600 text-primary-foreground px-5 py-3 text-sm font-semibold tracking-tight shadow-lg"
      >
        Independência
      </motion.div>
      {branches.map((b, i) => {
        const rad = (b.angle * Math.PI) / 180;
        const r = 140;
        const x = Math.cos(rad) * r;
        const y = Math.sin(rad) * r;
        return (
          <motion.div
            key={b.label}
            initial={{ opacity: 0, x: 0, y: 0, scale: 0.5 }}
            animate={{ opacity: 1, x, y, scale: 1 }}
            transition={{
              delay: 0.15 + i * 0.07,
              type: "spring",
              stiffness: 180,
              damping: 16,
            }}
            className={`absolute rounded-xl bg-gradient-to-br ${b.color} text-white text-xs font-medium px-3 py-1.5 shadow-md whitespace-nowrap`}
          >
            {b.label}
          </motion.div>
        );
      })}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none opacity-30"
        viewBox="-200 -160 400 320"
      >
        {branches.map((b) => {
          const rad = (b.angle * Math.PI) / 180;
          const r = 140;
          return (
            <line
              key={b.label}
              x1={0}
              y1={0}
              x2={Math.cos(rad) * r * 0.85}
              y2={Math.sin(rad) * r * 0.85}
              stroke="currentColor"
              strokeWidth="1"
              strokeDasharray="3 4"
              className="text-foreground/30"
            />
          );
        })}
      </svg>
    </div>
  );
}
