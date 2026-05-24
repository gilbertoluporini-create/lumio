"use client";

import Link from "next/link";
import { ArrowRight, Gift, Sparkles, TrendingUp, Trophy } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LumioWordmark } from "@/components/brand/logo";
import { LumiCharacter } from "@/components/brand/lumi";
import { ThemeToggle } from "@/components/theme-toggle";
import { Magnetic } from "@/components/landing/magnetic";
import { Reveal } from "@/components/landing/motion";

export default function EmbaixadorLandingPage() {
  return (
    <div className="relative min-h-screen overflow-x-clip">
      {/* Nav */}
      <header className="sticky top-0 z-30 backdrop-blur-xl bg-background/70 border-b border-border/40">
        <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3.5">
          <Link href="/" className="flex items-center">
            <LumioWordmark />
          </Link>
          <div className="flex items-center gap-1.5">
            <ThemeToggle />
            <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
              <Link href="/login">Já tenho conta</Link>
            </Button>
            <Magnetic strength={0.18}>
              <Button asChild variant="gradient" size="sm">
                <Link href="/signup">
                  Quero ser embaixador <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            </Magnetic>
          </div>
        </nav>
      </header>

      {/* HERO */}
      <section className="relative z-10 mx-auto max-w-6xl px-6 pt-14 pb-12 md:pt-20">
        <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_1fr] gap-12 items-center">
          <div>
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="mb-5 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-3 py-1"
            >
              <Sparkles className="h-3 w-3 text-primary" />
              <span className="text-[11px] uppercase tracking-[0.16em] text-primary font-medium">
                Programa Embaixador Lumio
              </span>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="text-[42px] sm:text-5xl md:text-6xl lg:text-[64px] font-semibold text-display leading-[1.02]"
            >
              Ganhe Pro grátis{" "}
              <span className="gradient-text font-bold">indicando amigos</span>.
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.6 }}
              className="mt-6 max-w-xl text-lg text-muted-foreground leading-relaxed"
            >
              A cada amigo que assina, você ganha <strong className="text-foreground">1 mês Pro grátis</strong>.
              Top embaixador do mês ganha <strong className="text-foreground">plano Power vitalício</strong>.
              Sem limite. Sem letra miúda.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35, duration: 0.6 }}
              className="mt-8 flex flex-col sm:flex-row items-start sm:items-center gap-3"
            >
              <Magnetic strength={0.22}>
                <Button asChild variant="gradient" size="xl" className="min-w-[240px]">
                  <Link href="/signup">
                    Quero meu código <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </Magnetic>
              <span className="text-sm text-muted-foreground">
                Já tem conta?{" "}
                <Link href="/account/embaixador" className="text-foreground underline underline-offset-4">
                  Pegar meu código
                </Link>
              </span>
            </motion.div>
          </div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.8 }}
            className="relative flex items-center justify-center"
          >
            <LumiCharacter mood="celebrating" size="hero" float />
          </motion.div>
        </div>
      </section>

      {/* RECOMPENSAS */}
      <section className="relative z-10 mx-auto max-w-6xl px-6 py-16">
        <Reveal className="text-center mb-12 max-w-2xl mx-auto">
          <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground font-medium mb-3">
            — Recompensas —
          </p>
          <h2 className="text-3xl md:text-4xl font-semibold text-display">
            Cada amigo vale{" "}
            <span className="gradient-text">um mês grátis</span>.
          </h2>
        </Reveal>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {REWARDS.map((r) => (
            <Reveal key={r.title}>
              <div className="h-full rounded-2xl border border-border/60 bg-card/60 backdrop-blur p-7">
                <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center mb-5">
                  <r.icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="text-lg font-semibold mb-2">{r.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{r.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* COMO FUNCIONA */}
      <section className="relative z-10 mx-auto max-w-4xl px-6 py-16">
        <Reveal className="text-center mb-12">
          <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground font-medium mb-3">
            — Como funciona —
          </p>
          <h2 className="text-3xl md:text-4xl font-semibold text-display">
            4 passos, <span className="gradient-text">2 minutos</span>.
          </h2>
        </Reveal>

        <div className="space-y-5">
          {STEPS.map((s, i) => (
            <Reveal key={i}>
              <div className="flex gap-5 items-start rounded-2xl border border-border/60 bg-card/40 p-6">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-bold tabular-nums">
                  {i + 1}
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-foreground mb-1">{s.title}</p>
                  <p className="text-sm text-muted-foreground">{s.desc}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section className="relative z-10 mx-auto max-w-3xl px-6 py-16">
        <Reveal className="text-center mb-10">
          <h2 className="text-3xl md:text-4xl font-semibold text-display">
            Perguntas comuns
          </h2>
        </Reveal>

        <div className="space-y-3">
          {FAQS.map((f, i) => (
            <Reveal key={i}>
              <details className="group rounded-xl border border-border/60 bg-card/40 p-5">
                <summary className="cursor-pointer font-medium text-foreground list-none flex items-center justify-between">
                  {f.q}
                  <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-90" />
                </summary>
                <p className="mt-3 text-sm text-muted-foreground leading-relaxed">{f.a}</p>
              </details>
            </Reveal>
          ))}
        </div>
      </section>

      {/* CTA */}
      <Reveal className="relative z-10 mx-auto max-w-6xl px-6 py-20">
        <div className="relative rounded-3xl border border-primary/40 bg-gradient-to-br from-primary/10 via-card to-card p-10 md:p-16 text-center overflow-hidden">
          <Badge variant="secondary" className="mb-5 gap-1">
            <Trophy className="h-3 w-3" />
            Top do mês ganha Power vitalício
          </Badge>
          <h2 className="text-3xl md:text-5xl font-bold text-display max-w-3xl mx-auto">
            Pega seu código.{" "}
            <span className="gradient-text">Começa hoje.</span>
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-muted-foreground text-base md:text-lg">
            30s pra criar conta. Sem cartão. Seu código fica pronto na hora.
          </p>
          <div className="mt-9 flex justify-center">
            <Magnetic strength={0.18}>
              <Button asChild variant="gradient" size="xl" className="min-w-[260px]">
                <Link href="/signup">
                  Quero meu código <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </Magnetic>
          </div>
        </div>
      </Reveal>

      <footer className="relative z-10 border-t border-border/40 mt-8">
        <div className="mx-auto max-w-6xl px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} Lumio
          </p>
          <div className="flex gap-5 text-xs text-muted-foreground">
            <Link href="/terms" className="hover:text-foreground transition-colors">
              Termos
            </Link>
            <Link href="/privacy" className="hover:text-foreground transition-colors">
              Privacidade
            </Link>
            <Link href="/" className="hover:text-foreground transition-colors">
              Voltar pra home
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

const REWARDS = [
  {
    icon: Gift,
    title: "1 mês Pro grátis",
    desc: "Por cada amigo que assina qualquer plano pago. Aplicado automaticamente na próxima renovação.",
  },
  {
    icon: TrendingUp,
    title: "Sem limite",
    desc: "Indicou 10 amigos pagantes? 10 meses grátis. Indicou 50? 50 meses. Sério, sem teto.",
  },
  {
    icon: Trophy,
    title: "Power vitalício",
    desc: "Top embaixador do mês (mais amigos pagantes trazidos) ganha plano Power pra sempre + selo no perfil.",
  },
];

const STEPS = [
  {
    title: "Cria conta no Lumio",
    desc: "30 segundos. Sem cartão. Seu código LUMI-XXXX já vem pronto.",
  },
  {
    title: "Compartilha código ou link",
    desc: "WhatsApp da turma, story do Insta, DM. Onde quiser. Seu link tem track de cliques e signups.",
  },
  {
    title: "Amigo cria conta usando seu link",
    desc: "Ele entra com 30 dias Pro grátis de boas-vindas. Você fica com o crédito reservado.",
  },
  {
    title: "Amigo vira pagante → você ganha",
    desc: "Quando ele assina qualquer plano, 1 mês Pro grátis cai na sua conta. Acompanha tudo no painel.",
  },
];

const FAQS = [
  {
    q: "Tem limite de quantos amigos posso indicar?",
    a: "Não. Indica 5, 50 ou 500. Cada amigo pagante = 1 mês Pro grátis pra você. Cumulativo.",
  },
  {
    q: "Quando recebo o crédito?",
    a: "Assim que o amigo vira pagante (paga a 1ª mensalidade ou anuidade), o crédito é registrado. Aplicado automaticamente na sua próxima renovação.",
  },
  {
    q: "Posso usar o programa se já sou pagante?",
    a: "Sim. Você acumula meses grátis pra renovações futuras. Se acumular mais do que sua assinatura cobre, a gente prorroga.",
  },
  {
    q: "O que o amigo ganha?",
    a: "Quem entra com seu link ganha 30 dias do plano Pro grátis. Não precisa cartão.",
  },
  {
    q: "Vale se eu indicar família, mesmo IP?",
    a: "Vale, mas a gente faz checagem anti-fraude (mesmo IP repetido com padrões suspeitos pode bloquear o crédito). Em casos legítimos (irmão, parceiro), conta normal.",
  },
  {
    q: "Como funciona o Power vitalício do top embaixador?",
    a: "Todo mês, quem trouxer mais amigos pagantes ganha plano Power pra sempre + selo Embaixador Oficial no perfil. Empate vai pra quem chegou primeiro no mês.",
  },
  {
    q: "Posso sacar em dinheiro em vez de plano?",
    a: "Hoje só meses grátis. Embaixadores com 20+ amigos pagantes podem pedir conversão pra Pix manualmente (R$30 por amigo pagante). Fala com a gente.",
  },
];
