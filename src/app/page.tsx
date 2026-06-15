"use client";

import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  CreditCard,
  Gift,
  Infinity as InfinityIcon,
  Languages,
  Mail,
  ShieldCheck,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { LumioWordmark } from "@/components/brand/logo";
import { LumiCharacter, LumiScene } from "@/components/brand/lumi";
import { LumioCoin } from "@/components/brand/lumio-coin";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  CountUp,
  MarqueeRow,
  Reveal,
  Stagger,
  StaggerItem,
} from "@/components/landing/motion";
import { LiveDemo } from "@/components/landing/live-demo";
import { Highlighter, PencilUnderline } from "@/components/landing/highlighter";
import { Magnetic } from "@/components/landing/magnetic";
import { PricingSection } from "@/components/landing/pricing-section";
import { CheckoutInterceptor } from "@/components/landing/checkout-interceptor";
import { Testimonials } from "@/components/landing/testimonials";
import { HowItWorks } from "@/components/landing/how-it-works";
import { Personas } from "@/components/landing/personas";
import { FaqSection } from "@/components/landing/faq-section";
import { SubjectsMarquee } from "@/components/landing/subjects-marquee";
import { ProductsTabs } from "@/components/landing/products-tabs";
import { BeforeAfter } from "@/components/landing/before-after";
import { LumiChatMock } from "@/components/landing/lumi-chat-mock";
import { Analytics } from "@/lib/analytics";

export default function LandingPage() {
  return (
    <div className="relative min-h-screen overflow-x-clip">
      {/* Nav */}
      <motion.header
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="sticky top-0 z-30 backdrop-blur-md bg-background/85 border-b border-border/40"
      >
        <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3.5">
          <Link href="/" className="flex items-center">
            <LumioWordmark />
          </Link>
          <div className="hidden items-center gap-7 md:flex">
            <NavLink href="#how">Como funciona</NavLink>
            <NavLink href="#products">Produtos</NavLink>
            <NavLink href="#for-who">Pra quem é</NavLink>
            <NavLink href="#pricing">Planos</NavLink>
            <NavLink href="/embaixador">Embaixador</NavLink>
            <NavLink href="#faq">FAQ</NavLink>
          </div>
          <div className="flex items-center gap-1.5">
            <ThemeToggle />
            <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
              <Link href="/login">Entrar</Link>
            </Button>
            <Magnetic strength={0.18}>
              <Button asChild variant="gradient" size="sm">
                <Link
                  href="/signup"
                  onClick={() => Analytics.landingCtaClick("nav")}
                >
                  Começar grátis <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            </Magnetic>
          </div>
        </nav>
      </motion.header>

      {/* HERO */}
      <section className="relative z-10 mx-auto max-w-6xl px-6 pt-14 pb-20 md:pt-20 lg:pt-24">
        <div className="grid grid-cols-1 lg:grid-cols-[1.05fr_1fr] gap-12 lg:gap-16 items-center">
          <div className="text-left relative">
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5 }}
              className="mb-6 inline-flex items-center gap-2.5 rounded-full border border-border/60 bg-card/60 px-3 py-1"
            >
              <span className="inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-medium">
                Disponível agora · 50 coins grátis
              </span>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1, duration: 0.7, ease: [0.21, 0.47, 0.32, 0.98] }}
              className="text-[42px] sm:text-5xl md:text-6xl lg:text-[68px] font-semibold text-display"
            >
              Volte a olhar pro{" "}
              <span className="gradient-text font-bold">professor.</span>
              <br />
              <span className="text-foreground/55">
                A gente cuida do{" "}
                <PencilUnderline delay={1.2} className="text-foreground">
                  resto
                </PencilUnderline>
                .
              </span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35, duration: 0.6 }}
              className="mt-7 max-w-xl text-lg text-muted-foreground leading-relaxed"
            >
              Transcreve a aula em tempo real,{" "}
              <Highlighter delay={1.6}>responde dúvida na hora</Highlighter> e
              gera resumo, flash card e quiz — organizado por matéria.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5, duration: 0.6 }}
              className="mt-9 flex flex-col sm:flex-row items-start sm:items-center gap-3"
            >
              <Magnetic strength={0.22}>
                <Button
                  asChild
                  variant="gradient"
                  size="xl"
                  className="min-w-[220px]"
                >
                  <Link
                    href="/signup"
                    onClick={() => Analytics.landingCtaClick("hero")}
                  >
                    Começar grátis <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </Magnetic>
              <Link
                href="#how"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1.5 group px-2"
              >
                Como funciona
                <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
              </Link>
            </motion.div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.7, duration: 0.6 }}
              className="mt-7 flex flex-col sm:flex-row items-start sm:items-center gap-4 text-xs"
            >
              <div className="inline-flex items-center gap-1.5 text-muted-foreground">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                <span>
                  <span className="text-foreground font-medium">Sem cartão</span> · cancele a qualquer hora
                </span>
              </div>
              <div className="hidden sm:block h-4 w-px bg-border" />
              <div className="inline-flex items-center gap-1.5 text-muted-foreground">
                <LumioCoin size={14} />
                <span>
                  <span className="text-foreground font-medium">50 coins</span> ao criar conta
                </span>
              </div>
              <div className="hidden sm:block h-4 w-px bg-border" />
              <div className="inline-flex items-center gap-1.5 text-muted-foreground">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
                <span>
                  <span className="text-foreground font-medium">Áudio no navegador</span> · zero upload
                </span>
              </div>
            </motion.div>
          </div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4, duration: 0.8 }}
            className="relative"
          >
            <LiveDemo />
          </motion.div>
        </div>
      </section>

      {/* MARQUEE */}
      <section className="relative z-10 border-y border-border/40 py-5">
        <MarqueeRow
          speed={55}
          items={[
            "Reconhecimento de voz nativo do navegador",
            "Zero upload de áudio — privacidade por padrão",
            "Português brasileiro de verdade",
            "Anexe PDF da aula e tudo se correlaciona",
            "Organizado por matéria, sempre",
            "Resumos · Flash cards · Quizzes · Mapas mentais",
            "Histórico ilimitado",
          ]}
        />
      </section>

      {/* SUBJECTS MARQUEE */}
      <section className="relative z-10 mx-auto max-w-6xl px-6 py-16">
        <Reveal className="text-center mb-6">
          <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground font-medium">
            — Já passou aqui —
          </p>
          <h3 className="mt-3 text-xl md:text-2xl font-semibold text-display max-w-xl mx-auto">
            Funciona com{" "}
            <span className="gradient-text">qualquer matéria</span>.
          </h3>
        </Reveal>
        <SubjectsMarquee speed={42} />
        <div className="mt-3">
          <SubjectsMarquee speed={50} reverse />
        </div>
      </section>

      {/* STATS */}
      <section className="relative z-10 mx-auto max-w-6xl px-6 py-10">
        <Stagger className="grid grid-cols-2 md:grid-cols-4 divide-x divide-border/40 border-y border-border/40">
          {STATS.map((s) => (
            <StaggerItem key={s.label} className="py-9 px-6 text-center">
              <div className="display-num text-5xl md:text-6xl font-bold text-foreground mb-3 tabular-nums">
                {typeof s.value === "number" ? (
                  <CountUp to={s.value} suffix={s.suffix ?? ""} />
                ) : (
                  <span className="bg-gradient-to-br from-primary to-violet-500 bg-clip-text text-transparent">
                    {s.value}
                  </span>
                )}
              </div>
              <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground font-semibold">
                {s.label}
              </p>
              {s.sub && (
                <p className="text-[10px] text-muted-foreground/70 mt-1.5">
                  {s.sub}
                </p>
              )}
            </StaggerItem>
          ))}
        </Stagger>
      </section>

      {/* TESTIMONIALS */}
      <Testimonials />

      {/* HOW (4 steps with illustrations) */}
      <HowItWorks />

      {/* MEET LUMI */}
      <section className="relative z-10 mx-auto max-w-6xl px-6 py-20 overflow-hidden">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.1fr] gap-12 lg:gap-16 items-center">
          <Reveal className="order-2 lg:order-1">
            <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground font-medium mb-4">
              — Conheça —
            </p>
            <h2 className="text-4xl md:text-5xl font-semibold text-display">
              Esse é o{" "}
              <span className="gradient-text font-bold">Lumi</span>.
            </h2>
            <p className="mt-5 text-lg text-muted-foreground leading-relaxed max-w-lg">
              Companheiro de estudos que escuta junto, anota tudo,{" "}
              <Highlighter delay={0.3}>te ajuda quando trava</Highlighter>.
            </p>
            <div className="mt-7 flex flex-wrap gap-2">
              {[
                { label: "Atento" },
                { label: "Curioso" },
                { label: "Focado" },
                { label: "Animado" },
              ].map((t) => (
                <span
                  key={t.label}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card px-3 py-1.5 text-xs font-medium"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                  {t.label}
                </span>
              ))}
            </div>
            <div className="mt-7 max-w-md">
              <LumiChatMock />
            </div>
          </Reveal>

          <div className="order-1 lg:order-2 relative flex items-center justify-center max-h-[420px] overflow-hidden">
            <LumiCharacter
              mood="studying"
              size="hero"
              float
              className="relative z-10"
            />
          </div>
        </div>
      </section>

      {/* PRODUTOS GERADOS */}
      <section
        id="products"
        className="relative z-10 mx-auto max-w-6xl px-6 py-20 overflow-hidden"
      >
        <Reveal className="mb-10 max-w-2xl">
          <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground font-medium mb-4">
            — Produtos gerados —
          </p>
          <h2 className="text-3xl md:text-5xl font-semibold text-display">
            Um clique vira{" "}
            <Highlighter delay={0.4}>material de prova</Highlighter>.
          </h2>
          <p className="mt-5 text-base text-muted-foreground max-w-xl">
            Clique nas abas pra ver cada formato.
          </p>
        </Reveal>

        <Reveal>
          <ProductsTabs />
        </Reveal>
      </section>

      {/* ANTES / DEPOIS — interativo */}
      <section className="relative z-10 mx-auto max-w-6xl px-6 py-20">
        <Reveal className="text-center mb-10 max-w-2xl mx-auto">
          <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground font-medium mb-3">
            — Antes / Depois —
          </p>
          <h2 className="text-3xl md:text-4xl font-semibold text-display">
            Áudio bruto vira{" "}
            <span className="gradient-text">resumo</span>.
          </h2>
        </Reveal>
        <Reveal className="relative max-w-4xl mx-auto">
          <BeforeAfter />
        </Reveal>
        <Reveal className="relative mt-16">
          <LumiScene
            scene="hero-desk"
            className="relative z-10 max-w-3xl mx-auto opacity-90"
          />
        </Reveal>
      </section>

      {/* PERSONAS */}
      <Personas />

      {/* TRUST / CONFIANÇA */}
      <section className="relative z-10 mx-auto max-w-6xl px-6 py-16">
        <Reveal className="text-center mb-10 max-w-2xl mx-auto">
          <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground font-medium mb-3">
            — Confiança —
          </p>
          <h2 className="text-3xl md:text-4xl font-semibold text-display">
            Transparente do{" "}
            <span className="gradient-text">áudio ao preço</span>.
          </h2>
        </Reveal>
        <Stagger className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          {TRUST.map((t) => (
            <StaggerItem key={t.title}>
              <div className="h-full rounded-2xl border border-border/60 bg-card p-5 md:p-6">
                <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10">
                  <t.Icon className="h-5 w-5 text-primary" strokeWidth={2.2} />
                </div>
                <p className="font-semibold text-sm md:text-base">{t.title}</p>
                <p className="mt-1.5 text-xs md:text-sm text-muted-foreground leading-relaxed">
                  {t.sub}
                </p>
              </div>
            </StaggerItem>
          ))}
        </Stagger>
      </section>

      {/* EMBAIXADOR — gancho de indicação acima do pricing */}
      <Reveal className="relative z-10 mx-auto max-w-3xl px-6 pt-8">
        <Link
          href="/embaixador"
          onClick={() => Analytics.landingCtaClick("embaixador_banner")}
          className="group flex items-center gap-4 rounded-2xl border border-primary/30 bg-primary/5 hover:bg-primary/10 px-5 py-4 transition-colors"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15">
            <Gift className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">
              Ou ganhe Pro de graça indicando amigos.
            </p>
            <p className="text-xs text-muted-foreground">
              1 mês Pro por amigo que assina · top embaixador ganha Power vitalício.
            </p>
          </div>
          <ArrowRight className="h-4 w-4 text-primary shrink-0 transition-transform group-hover:translate-x-1" />
        </Link>
      </Reveal>

      {/* PRICING */}
      <CheckoutInterceptor>
        <PricingSection />
      </CheckoutInterceptor>

      {/* FAQ */}
      <FaqSection />

      {/* CTA */}
      <Reveal className="relative z-10 mx-auto max-w-6xl px-6 py-20">
        <div className="relative rounded-3xl border border-border/80 bg-card p-10 md:p-16 text-center overflow-hidden">
          <div className="relative">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-background px-3 py-1">
              <LumioCoin size={14} />
              <span className="text-[11px] uppercase tracking-wider text-primary font-medium">
                50 coins de boas-vindas
              </span>
            </div>
            <h2 className="text-3xl md:text-5xl lg:text-6xl font-bold text-display max-w-3xl mx-auto">
              Sua próxima aula já podia estar{" "}
              <span className="gradient-text">resumida</span>.
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-muted-foreground text-base md:text-lg">
              30 segundos pra criar conta. Sem cartão. Sem download. Sem letra miúda.
            </p>
            <div className="mt-9 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <Magnetic strength={0.18}>
                <Button
                  asChild
                  variant="gradient"
                  size="xl"
                  className="min-w-[260px]"
                >
                  <Link
                    href="/signup"
                    onClick={() => Analytics.landingCtaClick("final_cta")}
                  >
                    Começar grátis <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </Magnetic>
              <Button
                asChild
                variant="ghost"
                size="xl"
                className="min-w-[180px]"
              >
                <Link href="#how">Como funciona</Link>
              </Button>
            </div>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm text-muted-foreground">
              {BULLETS.map((b) => (
                <div key={b} className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-primary" /> {b}
                </div>
              ))}
            </div>
          </div>
        </div>
      </Reveal>

      <footer className="relative z-10 border-t border-border/40 mt-8">
        <div className="mx-auto max-w-6xl px-6 py-12">
          <div className="grid gap-8 md:grid-cols-[1.2fr_1fr_1fr_1fr]">
            <div>
              <LumioWordmark className="mb-4" />
              <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">
                Transcrição e IA pra aulas universitárias. Feito por estudantes,
                pra estudantes.
              </p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium mb-4">
                Produto
              </p>
              <ul className="space-y-2.5 text-sm">
                <FooterLink href="#how">Como funciona</FooterLink>
                <FooterLink href="#products">Produtos gerados</FooterLink>
                <FooterLink href="#pricing">Planos</FooterLink>
                <FooterLink href="/embaixador">Programa Embaixador</FooterLink>
                <FooterLink href="/signup">Criar conta</FooterLink>
              </ul>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium mb-4">
                Empresa
              </p>
              <ul className="space-y-2.5 text-sm">
                <FooterLink href="#faq">FAQ</FooterLink>
                <FooterLink href="/terms">Termos de uso</FooterLink>
                <FooterLink href="/privacy">Privacidade</FooterLink>
              </ul>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium mb-4">
                Contato
              </p>
              <ul className="space-y-2.5 text-sm">
                <li>
                  <a
                    href="mailto:contato@lumioapp.net"
                    className="text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1.5"
                  >
                    <Mail className="h-3.5 w-3.5" />
                    contato@lumioapp.net
                  </a>
                </li>
                <FooterLink href="/login">Entrar</FooterLink>
              </ul>
            </div>
          </div>
          <div className="mt-10 pt-6 border-t border-border/40 flex flex-col sm:flex-row items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              © {new Date().getFullYear()} Lumio · Feito no Brasil, pra quem estuda.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

function NavLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="relative text-sm text-muted-foreground hover:text-foreground transition-colors group"
    >
      {children}
      <span className="absolute -bottom-1 left-0 w-0 h-px bg-foreground transition-all duration-300 group-hover:w-full" />
    </Link>
  );
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <li>
      <Link
        href={href}
        className="text-muted-foreground hover:text-foreground transition-colors"
      >
        {children}
      </Link>
    </li>
  );
}

const STATS: Array<{
  value: number | string;
  suffix?: string;
  label: string;
  sub?: string;
}> = [
  { value: "PT-BR", label: "Reconhecimento nativo", sub: "português brasileiro" },
  { value: "∞", label: "Histórico", sub: "sem expirar" },
  { value: 50, label: "Coins grátis", sub: "ao criar conta" },
  { value: 30, suffix: "s", label: "Pra criar conta", sub: "sem cartão" },
];

const BULLETS = [
  "Sem cartão de crédito",
  "50 coins grátis",
  "Chat IA com PDFs",
  "Funciona no celular",
];

const TRUST: Array<{ Icon: LucideIcon; title: string; sub: string }> = [
  {
    Icon: ShieldCheck,
    title: "Privacidade por padrão",
    sub: "O áudio é transcrito no seu navegador — nada de upload da gravação pra nuvem.",
  },
  {
    Icon: Languages,
    title: "Português de verdade",
    sub: "Reconhecimento de voz nativo em PT-BR, pensado pra aula brasileira.",
  },
  {
    Icon: CreditCard,
    title: "Sem cartão pra começar",
    sub: "Ganha 50 coins ao criar conta e cancela quando quiser. Sem fidelidade.",
  },
  {
    Icon: InfinityIcon,
    title: "Histórico ilimitado",
    sub: "Seus resumos, flash cards e quizzes ficam salvos e não expiram.",
  },
];
