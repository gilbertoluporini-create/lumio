"use client";

import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Coffee,
  Mail,
  Quote,
} from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { LumioWordmark } from "@/components/brand/logo";
import { LumiCharacter, LumiScene, LumiSticker } from "@/components/brand/lumi";
import { LumiIcon, type LumiIconName } from "@/components/brand/lumi-icon";
import { LumioCoin } from "@/components/brand/lumio-coin";
import { Badge } from "@/components/ui/badge";
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
import { LogosRow } from "@/components/landing/logos-row";
import { PricingSection } from "@/components/landing/pricing-section";
import { Testimonials } from "@/components/landing/testimonials";
import { HowItWorks } from "@/components/landing/how-it-works";
import { Personas } from "@/components/landing/personas";
import { FaqSection } from "@/components/landing/faq-section";

export default function LandingPage() {
  return (
    <div className="relative min-h-screen overflow-x-hidden">
      {/* Subtle paper-grid */}
      <div className="pointer-events-none fixed inset-0 grid-bg opacity-[0.35]" />
      {/* Soft glow accents — fixos, sutis, sem custo de cursor */}
      <div
        className="pointer-events-none fixed -top-40 right-1/3 h-[600px] w-[600px] opacity-25 blur-2xl"
        style={{
          background:
            "radial-gradient(closest-side, oklch(0.85 0.18 90 / 0.4), transparent 70%)",
        }}
      />
      <div
        className="pointer-events-none fixed top-1/3 -left-32 h-[500px] w-[500px] opacity-25 blur-2xl"
        style={{
          background:
            "radial-gradient(closest-side, oklch(0.65 0.22 290 / 0.35), transparent 70%)",
        }}
      />

      {/* Nav */}
      <motion.header
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="sticky top-0 z-30 backdrop-blur-xl bg-background/70 border-b border-border/40"
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
            <NavLink href="#faq">FAQ</NavLink>
          </div>
          <div className="flex items-center gap-1.5">
            <ThemeToggle />
            <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
              <Link href="/login">Entrar</Link>
            </Button>
            <Magnetic strength={0.18}>
              <Button asChild variant="gradient" size="sm">
                <Link href="/signup">
                  Começar grátis <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            </Magnetic>
          </div>
        </nav>
      </motion.header>

      {/* HERO */}
      <section className="relative z-10 mx-auto max-w-6xl px-6 pt-14 pb-20 md:pt-20 lg:pt-24">
        {/* decorative stickers - desktop only */}
        <div className="hidden lg:block absolute top-10 left-2 z-0 opacity-80">
          <LumiSticker sticker="stars-1" size={48} rotate={-12} />
        </div>
        <div className="hidden lg:block absolute bottom-16 right-4 z-0 opacity-80">
          <LumiSticker sticker="pencils" size={60} rotate={18} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1.05fr_1fr] gap-12 lg:gap-16 items-center">
          <div className="text-left relative">
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5 }}
              className="mb-6 inline-flex items-center gap-2.5 rounded-full border border-border/60 bg-card/60 backdrop-blur px-3 py-1"
            >
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500/60" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
              </span>
              <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-medium">
                Beta privado · vagas abertas
              </span>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1, duration: 0.7, ease: [0.21, 0.47, 0.32, 0.98] }}
              className="text-[42px] leading-[1.02] sm:text-5xl md:text-6xl lg:text-[64px] font-semibold tracking-tight"
            >
              Volte a olhar pro{" "}
              <span className="font-serif italic font-normal">professor.</span>
              <br />
              <span className="text-foreground/60">
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
              Você fala 250 palavras por minuto durante a aula —{" "}
              <Highlighter delay={1.6}>o Lumi acompanha</Highlighter>. Transcreve em português, responde dúvidas sobre o que{" "}
              <em className="font-serif">acabou</em> de ser dito, e te entrega resumos, flash cards e quizzes organizados por matéria.
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
                  <Link href="/signup">
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
              <div className="flex items-center gap-3">
                <div className="flex -space-x-2">
                  {[
                    { g: "from-rose-400 to-pink-500", l: "BC" },
                    { g: "from-amber-400 to-orange-500", l: "FP" },
                    { g: "from-emerald-400 to-teal-500", l: "VT" },
                    { g: "from-indigo-400 to-violet-500", l: "HM" },
                  ].map((a, i) => (
                    <div
                      key={i}
                      className={`h-7 w-7 rounded-full border-2 border-background bg-gradient-to-br ${a.g} flex items-center justify-center text-[9px] font-semibold text-white tracking-wider`}
                    >
                      {a.l}
                    </div>
                  ))}
                </div>
                <span className="text-muted-foreground">
                  <span className="text-foreground font-medium">+200 estudantes</span>{" "}
                  no beta privado
                </span>
              </div>
              <div className="hidden sm:block h-4 w-px bg-border" />
              <div className="inline-flex items-center gap-1.5 text-muted-foreground">
                <LumioCoin size={14} />
                <span>
                  <span className="text-foreground font-medium">50 coins</span> de boas-vindas
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
            <div className="pointer-events-none absolute -top-28 -right-2 md:-right-6 z-20 hidden md:block">
              <LumiCharacter mood="recording" size="lg" priority float />
            </div>
            <LiveDemo />
          </motion.div>
        </div>
      </section>

      {/* MARQUEE */}
      <section className="relative z-10 border-y border-border/40 bg-card/30 backdrop-blur py-5">
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

      {/* LOGOS */}
      <section className="relative z-10 mx-auto max-w-6xl px-6 py-16">
        <LogosRow />
      </section>

      {/* STATS */}
      <section className="relative z-10 mx-auto max-w-6xl px-6 py-10">
        <Stagger className="grid grid-cols-2 md:grid-cols-4 divide-x divide-border/40 border-y border-border/40">
          {STATS.map((s) => (
            <StaggerItem key={s.label} className="py-8 px-6 text-center">
              <div className="text-5xl md:text-6xl font-serif font-normal text-foreground mb-3">
                {typeof s.value === "number" ? (
                  <CountUp to={s.value} suffix={s.suffix ?? ""} />
                ) : (
                  s.value
                )}
              </div>
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
                {s.label}
              </p>
              {s.sub && (
                <p className="text-[10px] text-muted-foreground/70 mt-1">
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
      <section className="relative z-10 mx-auto max-w-6xl px-6 py-20">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.1fr] gap-12 lg:gap-16 items-center">
          <Reveal className="order-2 lg:order-1">
            <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground font-medium mb-4">
              — Conheça —
            </p>
            <h2 className="text-4xl md:text-5xl font-semibold tracking-tight leading-[1.1]">
              Esse é o{" "}
              <span className="font-serif italic font-normal">Lumi</span>.
            </h2>
            <p className="mt-5 text-lg text-muted-foreground leading-relaxed max-w-lg">
              Companheiro de estudos que escuta junto, anota tudo,{" "}
              <Highlighter delay={0.3}>e te ajuda quando trava</Highlighter>. Sem
              julgamento, sem letra miúda, sem mensagem das 3h.
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
                  className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card/60 backdrop-blur px-3 py-1.5 text-xs font-medium"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                  {t.label}
                </span>
              ))}
            </div>
          </Reveal>

          <div className="order-1 lg:order-2 relative flex items-center justify-center">
            <div
              className="pointer-events-none absolute inset-0 m-auto h-[420px] w-[420px] rounded-full blur-3xl opacity-50"
              style={{
                background:
                  "radial-gradient(closest-side, oklch(0.6 0.25 290 / 0.35), transparent 70%)",
              }}
            />
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
        className="relative z-10 mx-auto max-w-6xl px-6 py-20"
      >
        <Reveal className="mb-12 max-w-2xl">
          <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground font-medium mb-4">
            — Produtos gerados —
          </p>
          <h2 className="text-3xl md:text-5xl font-semibold tracking-tight leading-[1.1]">
            Chat, slides e transcrição:{" "}
            <span className="font-serif italic font-normal">grátis</span> no
            plano.
            <br />
            <span className="text-foreground/60">
              Coins servem pra <Highlighter delay={0.4}>produzir</Highlighter>.
            </span>
          </h2>
          <p className="mt-5 text-base text-muted-foreground leading-relaxed max-w-xl">
            Cada produto gerado vai pra subpasta da aula. Você acumula material
            de estudo conforme grava — e revisa quando quiser.
          </p>
        </Reveal>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {PRODUCTS.map((p) => (
            <Reveal
              key={p.title}
              className="group relative overflow-hidden rounded-2xl border border-border/60 bg-card p-6 hover:border-primary/40 hover:shadow-md transition-all"
            >
              <div className="absolute top-4 right-4 opacity-90">
                <LumiIcon name={p.icon} size={40} />
              </div>
              <div className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 text-primary text-[10px] font-mono font-medium px-2 py-0.5 mb-4">
                <LumioCoin size={12} /> {p.coins}
              </div>
              <h3 className="font-semibold tracking-tight mb-1.5 pr-10">
                {p.title}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {p.desc}
              </p>
              {p.soon && (
                <Badge
                  variant="secondary"
                  className="absolute bottom-4 right-4 text-[10px]"
                >
                  Em breve
                </Badge>
              )}
            </Reveal>
          ))}
        </div>
      </section>

      {/* LUMIO EM AÇÃO */}
      <section className="relative z-10 mx-auto max-w-6xl px-6 py-16">
        <Reveal className="text-center mb-10 max-w-2xl mx-auto">
          <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground font-medium mb-3">
            — Em ação —
          </p>
          <h2 className="text-3xl md:text-4xl font-semibold tracking-tight">
            Você na aula.{" "}
            <span className="font-serif italic font-normal">
              O Lumi nas anotações.
            </span>
          </h2>
        </Reveal>
        <Reveal className="relative">
          <div
            className="pointer-events-none absolute inset-0 m-auto h-[60%] w-[80%] rounded-3xl blur-3xl opacity-40"
            style={{
              background:
                "radial-gradient(closest-side, oklch(0.6 0.25 290 / 0.4), transparent 70%)",
            }}
          />
          <LumiScene
            scene="hero-desk"
            className="relative z-10 max-w-4xl mx-auto"
          />
        </Reveal>
      </section>

      {/* QUOTE — featured testimonial */}
      <section className="relative z-10 mx-auto max-w-4xl px-6 py-16">
        <Reveal>
          <div className="relative rounded-3xl border border-border/60 bg-card/60 backdrop-blur p-8 md:p-12">
            <Quote className="absolute top-6 left-6 h-10 w-10 text-foreground/8" />
            <p className="text-2xl md:text-3xl leading-relaxed font-serif italic text-foreground/90 pl-2 md:pl-6">
              &ldquo;Eu chegava em casa exausto, com o caderno cheio mas a
              cabeça vazia. O Lumio resolveu isso — agora eu{" "}
              <span className="not-italic font-sans font-medium">
                <Highlighter>presto atenção</Highlighter>
              </span>{" "}
              e revisão fica pro fim do dia.&rdquo;
            </p>
            <div className="mt-8 flex items-center gap-3 pl-2 md:pl-6">
              <div className="h-10 w-10 rounded-full bg-gradient-to-br from-rose-400 to-orange-400 ring-2 ring-background flex items-center justify-center text-xs font-semibold text-white">
                FP
              </div>
              <div>
                <p className="text-sm font-medium">Felipe P. · Medicina T11</p>
                <p className="text-xs text-muted-foreground">
                  Mandic · Beta privado, maio de 2026
                </p>
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      {/* PERSONAS */}
      <Personas />

      {/* PRICING */}
      <PricingSection />

      {/* FAQ */}
      <FaqSection />

      {/* CTA */}
      <Reveal className="relative z-10 mx-auto max-w-6xl px-6 py-20">
        <div className="relative rounded-3xl border border-border/80 bg-gradient-to-br from-primary/10 via-card to-fuchsia-500/10 p-10 md:p-16 text-center overflow-hidden">
          <div
            className="absolute -top-32 -right-32 h-[400px] w-[400px] rounded-full opacity-30 blur-2xl"
            style={{
              background:
                "radial-gradient(closest-side, oklch(0.85 0.18 90 / 0.6), transparent 70%)",
            }}
          />
          <div
            className="absolute -bottom-32 -left-32 h-[400px] w-[400px] rounded-full opacity-30 blur-2xl"
            style={{
              background:
                "radial-gradient(closest-side, oklch(0.7 0.2 330 / 0.5), transparent 70%)",
            }}
          />
          <div className="absolute inset-0 grid-bg opacity-20" />

          {/* floating stickers */}
          <div className="hidden md:block absolute top-8 right-12 opacity-90">
            <LumiSticker sticker="stars-2" size={56} rotate={12} />
          </div>
          <div className="hidden md:block absolute bottom-10 left-10 opacity-90">
            <LumiSticker sticker="bulbs" size={48} rotate={-10} />
          </div>

          <div className="relative">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-background/60 backdrop-blur px-3 py-1">
              <LumioCoin size={14} />
              <span className="text-[11px] uppercase tracking-wider text-primary font-medium">
                50 coins de boas-vindas
              </span>
            </div>
            <h2 className="text-3xl md:text-5xl lg:text-6xl font-semibold tracking-tight max-w-3xl mx-auto">
              Sua próxima aula já podia estar{" "}
              <span className="font-serif italic font-normal">resumida</span>.
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
                  <Link href="/signup">
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
                <Link href="/pricing">Ver planos pagos</Link>
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

      <footer className="relative z-10 border-t border-border/40 bg-card/30 mt-8">
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
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              © {new Date().getFullYear()} Lumio · Feito com
              <Coffee className="h-3 w-3 text-amber-700" />
              em São Paulo, pra quem estuda.
            </p>
            <p className="text-[11px] text-muted-foreground/70 font-mono">
              v0.beta · maio 2026
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
  { value: 97, suffix: "%", label: "Acurácia em PT-BR", sub: "no beta privado" },
  { value: "∞", label: "Histórico", sub: "sem expirar" },
  { value: 4, suffix: "h/dia", label: "Tempo médio salvo", sub: "por estudante" },
  { value: 30, suffix: "s", label: "Pra criar conta", sub: "sem cartão" },
];

const PRODUCTS: Array<{
  icon: LumiIconName;
  title: string;
  desc: string;
  coins: number;
  soon?: boolean;
}> = [
  {
    icon: "document",
    title: "Resumo estruturado",
    desc: "Resumo organizado por slide ou bloco, com bullets e dúvidas correlacionadas.",
    coins: 10,
  },
  {
    icon: "layers",
    title: "Flash cards",
    desc: "10 cartões pergunta-resposta com hint e difficulty. Atalhos: ← → e espaço.",
    coins: 12,
  },
  {
    icon: "trophy",
    title: "Quiz interativo",
    desc: "8 questões múltipla escolha com correção comentada. Atalhos 1-4 e Enter.",
    coins: 15,
  },
  {
    icon: "sparkle",
    title: "Mapa mental",
    desc: "Estrutura hierárquica com tema central + ramos coloridos e sub-tópicos.",
    coins: 20,
  },
];

const BULLETS = [
  "Sem cartão de crédito",
  "Beta aberto",
  "Chat IA incluído",
  "Funciona no celular",
];
