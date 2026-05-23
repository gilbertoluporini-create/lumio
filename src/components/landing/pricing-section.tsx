"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { Check, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Magnetic } from "./magnetic";
import { Highlighter } from "./highlighter";
import { Reveal } from "./motion";

type Plan = {
  id: "free" | "pro" | "annual";
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
};

const PLANS: Plan[] = [
  {
    id: "free",
    name: "Grátis",
    price: "R$ 0",
    cadence: "pra sempre",
    description: "Pra testar. Sem cartão.",
    cta: "Começar grátis",
    href: "/signup?plan=free",
    features: [
      "5 horas de transcrição/mês",
      "Histórico de 7 dias",
      "Chat com 20 perguntas/dia",
      "1 PDF anexado por aula",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    price: "R$ 19",
    cadence: "/mês",
    description: "Pra quem estuda todo dia.",
    highlight: true,
    popular: true,
    cta: "Assinar Pro",
    href: "/checkout?plan=pro",
    features: [
      "Transcrição ilimitada",
      "Histórico ilimitado",
      "Chat ilimitado com contexto",
      "PDFs ilimitados + correlação",
      "Resumo automático em todas as aulas",
      "Exportar Markdown",
    ],
  },
  {
    id: "annual",
    name: "Anual",
    price: "R$ 149",
    cadence: "/ano",
    description: "Tudo do Pro · 2 meses grátis.",
    savings: "Economize R$ 79",
    cta: "Assinar Anual",
    href: "/checkout?plan=annual",
    features: [
      "Tudo do Pro, sem limites",
      "Exportar pra Anki (em breve)",
      "Suporte prioritário",
      "Acesso antecipado a novidades",
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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 items-stretch">
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

                <div className="flex items-baseline gap-1.5 mb-6">
                  <span className="text-4xl md:text-5xl font-semibold tracking-tight">
                    {plan.price}
                  </span>
                  <span className="text-sm text-muted-foreground">{plan.cadence}</span>
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

      <Reveal className="mt-16">
        <div className="rounded-xl border border-border/60 bg-card/60 backdrop-blur p-6 md:p-8">
          <h3 className="text-sm uppercase tracking-wider text-muted-foreground font-medium mb-5">
            Perguntas rápidas
          </h3>
          <div className="grid md:grid-cols-3 gap-x-8 gap-y-6">
            {FAQS.map((faq) => (
              <div key={faq.q}>
                <p className="font-medium text-sm mb-1.5">{faq.q}</p>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {faq.a}
                </p>
              </div>
            ))}
          </div>
        </div>
      </Reveal>
    </section>
  );
}

const FAQS = [
  {
    q: "Posso cancelar quando?",
    a: "Sim, no app. Sem fidelidade. Você continua com acesso até o fim do período pago.",
  },
  {
    q: "Onde meus áudios ficam salvos?",
    a: "Os áudios não saem do seu navegador — só o texto da transcrição. Tudo armazenado com criptografia em repouso.",
  },
  {
    q: "Funciona em qualquer aula?",
    a: "Em qualquer aula em português. Para outros idiomas, o reconhecimento usa o do seu navegador.",
  },
];
