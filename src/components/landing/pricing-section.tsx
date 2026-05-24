"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { Check, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LumioCoin } from "@/components/brand/lumio-coin";
import { Magnetic } from "./magnetic";
import { Highlighter } from "./highlighter";
import { Reveal } from "./motion";

type Plan = {
  id: "free" | "starter" | "pro" | "power";
  name: string;
  price: string;
  cadence: string;
  description: string;
  highlight?: boolean;
  popular?: boolean;
  cta: string;
  href: string;
  features: string[];
  savings?: string;
  coinsTagline: string;
};

const PLANS: Plan[] = [
  {
    id: "free",
    name: "Grátis",
    price: "R$ 0",
    cadence: "pra sempre",
    description: "Pra conhecer o Lumio.",
    coinsTagline: "50 coins de boas-vindas",
    cta: "Começar grátis",
    href: "/signup?plan=free",
    features: [
      "3 aulas por mês",
      "Chat IA, slides e transcrição ilimitados",
      "50 coins pra gerar 5 resumos",
      "Sem cartão de crédito",
    ],
  },
  {
    id: "starter",
    name: "Starter",
    price: "R$ 39",
    cadence: "/mês",
    description: "Pra quem tem aulas regulares.",
    coinsTagline: "200 coins/mês",
    cta: "Assinar Starter",
    href: "/checkout?plan=starter",
    features: [
      "20 aulas por mês",
      "Chat IA, slides e transcrição inclusos",
      "200 coins pra gerar resumos e flash cards",
      "Cronograma extraído da grade",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    price: "R$ 69",
    cadence: "/mês",
    description: "Pra quem estuda todo dia.",
    highlight: true,
    popular: true,
    coinsTagline: "500 coins/mês",
    cta: "Assinar Pro",
    href: "/checkout?plan=pro",
    features: [
      "100 aulas por mês (na prática, ilimitado)",
      "Tudo do Starter, com folga",
      "500 coins pra resumos, flash cards e quizzes",
      "Suporte prioritário",
    ],
  },
  {
    id: "power",
    name: "Power",
    price: "R$ 119",
    cadence: "/mês",
    description: "Aulas todos os dias + revisão pesada.",
    coinsTagline: "1500 coins/mês",
    cta: "Assinar Power",
    href: "/checkout?plan=power",
    features: [
      "Aulas ilimitadas, sem teto",
      "1500 coins pra produzir muitos assets",
      "Acesso antecipado a novidades",
      "Suporte prioritário",
    ],
  },
];

export function PricingSection() {
  return (
    <section id="pricing" className="relative z-10 mx-auto max-w-6xl px-6 py-24">
      <Reveal className="text-center mb-14 max-w-2xl mx-auto">
        <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground font-medium mb-4">
          — Planos —
        </p>
        <h2 className="text-3xl md:text-5xl font-semibold tracking-tight">
          Preço de café.{" "}
          <span className="font-serif italic font-normal">
            <Highlighter>Tempo de volta</Highlighter>
          </span>{" "}
          na vida.
        </h2>
        <p className="mt-4 text-muted-foreground">
          Cancele quando quiser. Sem fidelidade. Sem letra miúda.
        </p>
      </Reveal>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-stretch">
        {PLANS.map((plan, idx) => (
          <motion.div
            key={plan.id}
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ delay: idx * 0.08, duration: 0.5, ease: [0.21, 0.47, 0.32, 0.98] }}
            className={`relative ${plan.highlight ? "md:-mt-4 md:mb-4" : ""}`}
          >
            {plan.popular && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
                <Badge variant="default" className="gap-1 shadow-md">
                  <Sparkles className="h-3 w-3" /> Mais escolhido
                </Badge>
              </div>
            )}
            <div
              className={`relative h-full overflow-hidden rounded-xl border p-7 transition-all ${
                plan.highlight
                  ? "border-primary/40 bg-gradient-to-br from-primary/5 via-card to-fuchsia-500/5 shadow-xl"
                  : "border-border/70 bg-card/80 backdrop-blur"
              }`}
            >
              {plan.highlight && (
                <div className="absolute inset-0 grid-bg opacity-20 pointer-events-none" />
              )}

              <div className="relative">
                <div className="flex items-baseline justify-between gap-3 mb-1">
                  <h3 className="text-lg font-semibold tracking-tight">{plan.name}</h3>
                  {plan.savings && (
                    <Badge variant="success" className="text-[10px]">
                      {plan.savings}
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground mb-5">{plan.description}</p>

                <div className="flex items-baseline gap-1.5 mb-3">
                  <span className="text-4xl md:text-5xl font-semibold tracking-tight">
                    {plan.price}
                  </span>
                  <span className="text-sm text-muted-foreground">{plan.cadence}</span>
                </div>

                <div className="mb-5 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary">
                  <LumioCoin size={14} /> {plan.coinsTagline}
                </div>

                {plan.highlight ? (
                  <Magnetic strength={0.18}>
                    <Button
                      asChild
                      variant="gradient"
                      size="lg"
                      className="w-full mb-6"
                    >
                      <Link href={plan.href}>{plan.cta}</Link>
                    </Button>
                  </Magnetic>
                ) : (
                  <Button
                    asChild
                    variant="outline"
                    size="lg"
                    className="w-full mb-6"
                  >
                    <Link href={plan.href}>{plan.cta}</Link>
                  </Button>
                )}

                <ul className="space-y-2.5">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-sm">
                      <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                      <span className="text-foreground/80 leading-relaxed">{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      <Reveal className="mt-12">
        <div className="rounded-2xl border border-border/60 bg-gradient-to-br from-amber-500/5 via-card to-fuchsia-500/5 p-6 md:p-7 flex flex-col md:flex-row items-start md:items-center gap-4 md:gap-6">
          <div className="shrink-0 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 border border-primary/20">
              <LumioCoin size={28} />
            </div>
            <div>
              <p className="text-sm font-semibold tracking-tight">
                Como funcionam os Lumio Coins
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                A moeda que troca por material de estudo
              </p>
            </div>
          </div>
          <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <CoinLine label="Resumo" cost={10} />
            <CoinLine label="Flash cards" cost={12} />
            <CoinLine label="Quiz" cost={15} />
            <CoinLine label="Mapa mental" cost={20} />
          </div>
        </div>
      </Reveal>
    </section>
  );
}

function CoinLine({ label, cost }: { label: string; cost: number }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-border/40 bg-background/60 backdrop-blur px-3 py-2">
      <span className="text-foreground/80">{label}</span>
      <span className="inline-flex items-center gap-1 font-mono font-medium text-primary">
        <LumioCoin size={11} />
        {cost}
      </span>
    </div>
  );
}
