"use client";

import Link from "next/link";
import {
  ArrowRight,
  Banknote,
  Sparkles,
  TrendingUp,
  Trophy,
  Percent,
} from "lucide-react";
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
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="hidden sm:inline-flex"
            >
              <Link href="/login">Já tenho conta</Link>
            </Button>
            <Magnetic strength={0.18}>
              <Button asChild variant="gradient" size="sm">
                <Link href="https://wa.me/?text=Oi%20Lumio%2C%20quero%20ser%20embaixador">
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
              Ganhe 25% de comissão{" "}
              <span className="gradient-text font-bold">indicando o Lumio</span>.
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.6 }}
              className="mt-6 max-w-xl text-lg text-muted-foreground leading-relaxed"
            >
              Cupom personalizado pros seus seguidores ganharem{" "}
              <strong className="text-foreground">10% off</strong>. Você ganha{" "}
              <strong className="text-foreground">25% recorrente via PIX</strong>{" "}
              todo mês que eles renovarem. Sem limite, sem prazo.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35, duration: 0.6 }}
              className="mt-8 flex flex-col sm:flex-row items-start sm:items-center gap-3"
            >
              <Magnetic strength={0.22}>
                <Button
                  asChild
                  variant="gradient"
                  size="xl"
                  className="min-w-[260px]"
                >
                  <Link href="https://wa.me/?text=Oi%20Lumio%2C%20quero%20ser%20embaixador">
                    Quero ser embaixador <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </Magnetic>
              <span className="text-sm text-muted-foreground">
                Já sou embaixador?{" "}
                <Link
                  href="/account/embaixador"
                  className="text-foreground underline underline-offset-4"
                >
                  Acessar painel
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

      {/* QUANTO DÁ PRA GANHAR */}
      <section className="relative z-10 mx-auto max-w-5xl px-6 py-16">
        <Reveal className="text-center mb-12 max-w-2xl mx-auto">
          <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground font-medium mb-3">
            — Quanto dá pra ganhar —
          </p>
          <h2 className="text-3xl md:text-4xl font-semibold text-display">
            <span className="gradient-text">25% recorrente</span> — sem teto.
          </h2>
          <p className="mt-4 text-muted-foreground">
            Cada assinante que entrar pelo seu cupom rende comissão TODO MÊS que
            ele renovar. Acumulativo.
          </p>
        </Reveal>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {EARNINGS.map((e) => (
            <Reveal key={e.label}>
              <div
                className={`h-full rounded-2xl border p-7 ${
                  e.highlight
                    ? "border-primary/50 bg-gradient-to-br from-primary/10 to-card"
                    : "border-border/60 bg-card/60 backdrop-blur"
                }`}
              >
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-2">
                  {e.label}
                </p>
                <p className="text-4xl font-bold tabular-nums text-display mb-2">
                  R$ {e.monthly}
                </p>
                <p className="text-sm text-muted-foreground">
                  /mês recorrente · R$ {e.yearly}/ano
                </p>
                <p className="mt-4 text-xs text-foreground/70 leading-relaxed">
                  {e.desc}
                </p>
              </div>
            </Reveal>
          ))}
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Cálculo: 25% de R$ 69 (plano Pro) × N assinantes ativos.
        </p>
      </section>

      {/* RECOMPENSAS */}
      <section className="relative z-10 mx-auto max-w-6xl px-6 py-16">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {REWARDS.map((r) => (
            <Reveal key={r.title}>
              <div className="h-full rounded-2xl border border-border/60 bg-card/60 backdrop-blur p-7">
                <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center mb-5">
                  <r.icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="text-lg font-semibold mb-2">{r.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {r.desc}
                </p>
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
                <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
                  {f.a}
                </p>
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
            Programa por convite
          </Badge>
          <h2 className="text-3xl md:text-5xl font-bold text-display max-w-3xl mx-auto">
            Bora ganhar dinheiro{" "}
            <span className="gradient-text">indicando algo bom?</span>
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-muted-foreground text-base md:text-lg">
            Manda DM pra @lumioapp com seu @ do Insta + tamanho de audiência. A
            gente responde em até 24h com seu cupom personalizado.
          </p>
          <div className="mt-9 flex justify-center">
            <Magnetic strength={0.18}>
              <Button
                asChild
                variant="gradient"
                size="xl"
                className="min-w-[280px]"
              >
                <Link href="https://wa.me/?text=Oi%20Lumio%2C%20quero%20ser%20embaixador">
                  Quero ser embaixador <ArrowRight className="h-4 w-4" />
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
            <Link
              href="/terms"
              className="hover:text-foreground transition-colors"
            >
              Termos
            </Link>
            <Link
              href="/privacy"
              className="hover:text-foreground transition-colors"
            >
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

const EARNINGS = [
  {
    label: "5 assinantes Pro",
    monthly: "86",
    yearly: "1.035",
    desc: "5 amigos da tua turma que assinaram. Conservador — provavelmente você fecha isso em 1 mês postando 2x/semana.",
    highlight: false,
  },
  {
    label: "10 assinantes Pro",
    monthly: "172",
    yearly: "2.070",
    desc: "Realista pra micro-influencer (1K-10K seguidores) postando consistentemente por 2 meses.",
    highlight: true,
  },
  {
    label: "30 assinantes Pro",
    monthly: "517",
    yearly: "6.210",
    desc: "Embaixador top — perfis ativos com Reels viralizando. Possível em 3-4 meses de dedicação.",
    highlight: false,
  },
];

const REWARDS = [
  {
    icon: Percent,
    title: "25% recorrente",
    desc: "Sobre o valor de cada assinatura ativa que veio pelo seu cupom. Todo mês, sem expiração.",
  },
  {
    icon: Banknote,
    title: "PIX mensal automático",
    desc: "Até o dia 5 de cada mês, comissão cai na sua chave PIX. Sem mínimo de saque.",
  },
  {
    icon: TrendingUp,
    title: "Sem limite, sem prazo",
    desc: "Indique 5, 50 ou 500. Enquanto eles assinarem, você recebe. Não tem teto nem deadline.",
  },
];

const STEPS = [
  {
    title: "Aplica via WhatsApp/DM",
    desc: "Manda mensagem pra @lumioapp com seu @ do Insta + tamanho de audiência + tipo de conteúdo que posta.",
  },
  {
    title: "A gente aprova e cria seu cupom",
    desc: "Cupom personalizado com seu nome (ex: LARI10) — dá 10% off pros seus seguidores no checkout.",
  },
  {
    title: "Você cadastra sua chave PIX",
    desc: "No painel /account/embaixador. Pra gente saber pra onde mandar a comissão.",
  },
  {
    title: "Divulga, ganha, recebe PIX",
    desc: "Posta nos seus canais com seu cupom. Cada assinante que entrar rende 25% recorrente todo mês.",
  },
];

const FAQS = [
  {
    q: "Quanto eu ganho por assinante?",
    a: "25% do valor da assinatura, recorrente. Plano Starter (R$ 39) = R$ 9,75/mês. Plano Pro (R$ 69) = R$ 17,25/mês. Plano Power (R$ 119) = R$ 29,75/mês. Anuais pagam comissão sobre o valor cheio no momento da renovação.",
  },
  {
    q: "Quando recebo o pagamento?",
    a: "PIX até o dia 5 de cada mês, referente ao mês anterior. Sem mínimo — se você acumulou R$ 5, recebe R$ 5. Se acumulou R$ 5.000, recebe R$ 5.000.",
  },
  {
    q: "O que o meu seguidor ganha usando meu cupom?",
    a: "10% de desconto recorrente em qualquer plano do Lumio. Aparece automático no checkout do Stripe — ele só digita o cupom no campo de promoção.",
  },
  {
    q: "Por quanto tempo recebo a comissão de cada assinante?",
    a: "Enquanto ele continuar pagando. Se ele cancelar, a comissão para. Se voltar com seu cupom de novo, retoma. Sem deadline da nossa parte.",
  },
  {
    q: "Tem exclusividade? Posso ser embaixador de outros apps?",
    a: "Sem exclusividade. Pode ser de quantos quiser. Mas claro — se promover Chagas e Lumio no mesmo post, seu seguidor fica confuso. Recomendamos focar.",
  },
  {
    q: "Como sei quantas pessoas usaram meu cupom?",
    a: "Painel em /account/embaixador mostra cliques, signups, pagantes e comissão acumulada do mês em tempo real. Atualiza automático.",
  },
  {
    q: "Como aplico?",
    a: "Manda DM pra @lumioapp ou WhatsApp pelo botão acima. Diz seu @ do Insta, faculdade, e que tipo de conteúdo você posta. Resposta em até 24h.",
  },
];
