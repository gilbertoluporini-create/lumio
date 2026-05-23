"use client";

import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Clock,
  Coffee,
  FileText,
  FolderTree,
  Heart,
  Highlighter as HighlighterIcon,
  Mic,
  Quote,
  Sparkles,
  Stethoscope,
  Waves,
  Zap,
} from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LumioWordmark } from "@/components/brand/logo";
import { LumiCharacter, LumiScene, LumiSticker } from "@/components/brand/lumi";
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
import { SpotlightCursor } from "@/components/landing/spotlight";
import { LogosRow } from "@/components/landing/logos-row";
import { PricingSection } from "@/components/landing/pricing-section";

export default function LandingPage() {
  return (
    <div className="relative min-h-screen overflow-x-hidden">
      <SpotlightCursor />
      {/* Subtle paper-grid */}
      <div className="pointer-events-none fixed inset-0 grid-bg opacity-40" />
      <div
        className="pointer-events-none fixed -top-40 right-1/3 h-[600px] w-[600px] opacity-30 blur-3xl"
        style={{
          background:
            "radial-gradient(closest-side, oklch(0.85 0.18 90 / 0.45), transparent 70%)",
        }}
      />
      <div
        className="pointer-events-none fixed top-1/3 -left-32 h-[500px] w-[500px] opacity-30 blur-3xl"
        style={{
          background:
            "radial-gradient(closest-side, oklch(0.65 0.22 290 / 0.4), transparent 70%)",
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
            <NavLink href="#features">Recursos</NavLink>
            <NavLink href="#for-who">Pra quem é</NavLink>
          </div>
          <div className="flex items-center gap-1.5">
            <ThemeToggle />
            <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
              <Link href="/login">Entrar</Link>
            </Button>
            <Magnetic strength={0.2}>
              <Button asChild variant="gradient" size="sm">
                <Link href="/signup">
                  Começar grátis <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            </Magnetic>
          </div>
        </nav>
      </motion.header>

      {/* HERO — assimétrico, texto esquerda + demo viva direita */}
      <section className="relative z-10 mx-auto max-w-6xl px-6 pt-16 pb-24 md:pt-24 lg:pt-28">
        <div className="grid grid-cols-1 lg:grid-cols-[1.05fr_1fr] gap-12 lg:gap-20 items-center">
          {/* LEFT: editorial copy */}
          <div className="text-left">
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5 }}
              className="mb-6 inline-flex items-center gap-2"
            >
              <span className="h-px w-8 bg-foreground/30" />
              <span className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground font-medium">
                Transcrição + IA pra aulas universitárias
              </span>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1, duration: 0.7, ease: [0.21, 0.47, 0.32, 0.98] }}
              className="text-[44px] leading-[1.05] sm:text-5xl md:text-6xl font-semibold tracking-tight"
            >
              Volte a olhar pro{" "}
              <span className="font-serif italic font-normal">professor.</span>
              <br />
              <span className="text-foreground/60">
                A gente cuida do{" "}
                <PencilUnderline delay={1.2} className="text-foreground">resto</PencilUnderline>.
              </span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35, duration: 0.6 }}
              className="mt-7 max-w-xl text-lg text-muted-foreground leading-relaxed"
            >
              Lumio escuta sua aula,{" "}
              <Highlighter delay={1.6}>transcreve em português</Highlighter>, responde
              dúvidas sobre o que <em className="font-serif">acabou</em> de ser dito, e te entrega um
              resumo organizado por matéria.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5, duration: 0.6 }}
              className="mt-9 flex flex-col sm:flex-row items-start sm:items-center gap-3"
            >
              <Magnetic strength={0.22}>
                <Button asChild variant="gradient" size="xl" className="min-w-[200px]">
                  <Link href="/signup">
                    Começar grátis <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </Magnetic>
              <Link
                href="#pricing"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1.5 group"
              >
                Ver planos
                <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
              </Link>
            </motion.div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.8, duration: 0.6 }}
              className="mt-8 flex items-center gap-4 text-xs text-muted-foreground"
            >
              <div className="flex -space-x-2">
                {[
                  "from-rose-400 to-pink-400",
                  "from-amber-400 to-orange-400",
                  "from-emerald-400 to-teal-400",
                  "from-sky-400 to-indigo-400",
                ].map((g, i) => (
                  <div
                    key={i}
                    className={`h-7 w-7 rounded-full border-2 border-background bg-gradient-to-br ${g}`}
                  />
                ))}
              </div>
              <span>
                <span className="text-foreground font-medium">Estudantes</span> de medicina,
                direito e engenharia no beta privado
              </span>
            </motion.div>
          </div>

          {/* RIGHT: live demo + Lumi peeking */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4, duration: 0.8 }}
            className="relative"
          >
            {/* Lumi mascot peeking — flutua sutilmente */}
            <div className="pointer-events-none absolute -top-10 -right-4 z-20 hidden md:block">
              <LumiCharacter mood="default" size="lg" priority float />
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
            "Zero upload — privacidade por padrão",
            "Português brasileiro de verdade",
            "Anexe PDF da aula e tudo se correlaciona",
            "Organizado por matéria, sempre",
            "Resumo automático ao final",
            "Histórico ilimitado",
            "Exporta em Markdown",
          ]}
        />
      </section>

      {/* LOGOS */}
      <section className="relative z-10 mx-auto max-w-6xl px-6 py-16">
        <LogosRow />
      </section>

      {/* STATS — minimal editorial */}
      <section className="relative z-10 mx-auto max-w-6xl px-6 py-16">
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
                <p className="text-[10px] text-muted-foreground/70 mt-1">{s.sub}</p>
              )}
            </StaggerItem>
          ))}
        </Stagger>
      </section>

      {/* MEET LUMI — apresentação do mascote */}
      <section className="relative z-10 mx-auto max-w-6xl px-6 py-24">
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
              <Highlighter delay={0.3}>e te ajuda quando trava</Highlighter>.
              Sem julgamento, sem letra miúda, sem mensagem das 3h.
            </p>
            <div className="mt-7 flex flex-wrap gap-2">
              {[
                { label: "Atento", mood: "default" },
                { label: "Curioso", mood: "thinking" },
                { label: "Focado", mood: "studying" },
                { label: "Animado", mood: "celebrating" },
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
            {/* Soft glow background */}
            <div
              className="pointer-events-none absolute inset-0 m-auto h-[420px] w-[420px] rounded-full blur-3xl opacity-50"
              style={{
                background:
                  "radial-gradient(closest-side, oklch(0.6 0.25 290 / 0.35), transparent 70%)",
              }}
            />
            <LumiCharacter mood="studying" size="hero" float className="relative z-10" />
          </div>
        </div>
      </section>

      {/* LUMIO EM AÇÃO — cena ilustrada mostrando o produto no contexto real */}
      <section className="relative z-10 mx-auto max-w-6xl px-6 py-16">
        <Reveal className="text-center mb-10 max-w-2xl mx-auto">
          <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground font-medium mb-3">
            — Em ação —
          </p>
          <h2 className="text-3xl md:text-4xl font-semibold tracking-tight">
            Você na aula.{" "}
            <span className="font-serif italic font-normal">O Lumi nas anotações.</span>
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
          <LumiScene scene="hero-desk" className="relative z-10 max-w-4xl mx-auto" />
        </Reveal>
      </section>

      {/* HOW — numeração editorial 01/02/03 */}
      <section id="how" className="relative z-10 mx-auto max-w-6xl px-6 py-24">
        <Reveal className="text-center mb-16 max-w-2xl mx-auto">
          <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground font-medium mb-4">
            — Como funciona —
          </p>
          <h2 className="text-3xl md:text-5xl font-semibold tracking-tight">
            Três passos.{" "}
            <span className="font-serif italic font-normal text-foreground/70">
              Zero fricção.
            </span>
          </h2>
        </Reveal>

        <Stagger className="grid gap-px bg-border/40 border border-border/40 rounded-2xl overflow-hidden" gap={0.15}>
          <div className="grid md:grid-cols-3 gap-px bg-border/40">
            {STEPS.map((s, i) => (
              <StaggerItem key={s.title} className="bg-card relative group p-8 md:p-10">
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" style={{
                  background: "radial-gradient(circle at top, oklch(0.6 0.22 290 / 0.06), transparent 60%)",
                }} />
                <div className="relative">
                  <div className="flex items-baseline gap-4 mb-6">
                    <span className="editorial-num text-6xl text-foreground/15 select-none leading-none">
                      0{i + 1}
                    </span>
                    <s.icon className="h-5 w-5 text-primary/70" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2 tracking-tight">
                    {s.title}
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {s.desc}
                  </p>
                  <div className="mt-6 inline-flex items-center gap-1 text-xs text-muted-foreground/70 font-mono">
                    <span className="h-px w-6 bg-foreground/20" /> {s.meta}
                  </div>
                </div>
              </StaggerItem>
            ))}
          </div>
        </Stagger>
      </section>

      {/* BENTO GRID — features assimétricas */}
      <section id="features" className="relative z-10 mx-auto max-w-6xl px-6 py-24">
        <Reveal className="mb-12 max-w-2xl">
          <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground font-medium mb-4">
            — O que você ganha —
          </p>
          <h2 className="text-3xl md:text-5xl font-semibold tracking-tight leading-[1.1]">
            Pequenos hábitos,{" "}
            <span className="font-serif italic font-normal">grandes diferenças</span>.
            <br />
            <span className="text-foreground/50">Cada detalhe pensado pra quem tem 4h de aula por dia.</span>
          </h2>
        </Reveal>

        <div className="grid grid-cols-1 md:grid-cols-6 gap-4 auto-rows-[200px]">
          {/* Big — transcription */}
          <BentoCard className="md:col-span-4 md:row-span-2 paper-texture">
            <div className="flex flex-col h-full">
              <div className="flex items-center justify-between mb-4">
                <Mic className="h-5 w-5 text-primary" />
                <Badge variant="live" className="gap-1 text-[10px]">
                  <span className="h-1 w-1 rounded-full bg-red-500 pulse-dot" /> Ao vivo
                </Badge>
              </div>
              <h3 className="text-2xl font-semibold tracking-tight mb-2">
                Transcrição que <Highlighter delay={0.2}>não falha</Highlighter>.
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed max-w-md">
                Reconhecimento nativo do navegador, otimizado pra português brasileiro. Sem upload,
                sem latência perceptível.
              </p>
              <div className="mt-auto pt-6">
                <div className="rounded-md border border-border/60 bg-background p-3 font-mono text-xs text-muted-foreground space-y-1">
                  <p>
                    <span className="text-foreground/40">[14:22]</span> A suprarrenal direita tem formato{" "}
                    <span className="text-foreground">piramidal</span>…
                  </p>
                  <p>
                    <span className="text-foreground/40">[14:23]</span>{" "}
                    <span className="shimmer rounded px-1 text-foreground">…enquanto a esquerda apresenta formato semilunar</span>
                    <span className="caret" />
                  </p>
                </div>
              </div>
            </div>
          </BentoCard>

          {/* Med — chat */}
          <BentoCard className="md:col-span-2 md:row-span-1">
            <div className="flex flex-col h-full">
              <HighlighterIcon className="h-5 w-5 text-primary mb-3" />
              <h3 className="text-base font-semibold tracking-tight mb-1.5">
                Pergunte enquanto rola
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                A IA enxerga tudo que foi dito até agora e responde no contexto.
              </p>
            </div>
          </BentoCard>

          {/* Small — folder */}
          <BentoCard className="md:col-span-2 md:row-span-1 bg-gradient-to-br from-rose-500/5 via-card to-pink-500/5">
            <div className="flex flex-col h-full">
              <FolderTree className="h-5 w-5 text-rose-500 mb-3" />
              <h3 className="text-base font-semibold tracking-tight mb-1.5">
                Sempre no lugar certo
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Cada aula vai pra pasta da matéria. Achar é fácil.
              </p>
            </div>
          </BentoCard>

          {/* Big — slides */}
          <BentoCard className="md:col-span-3 md:row-span-1">
            <div className="flex items-center gap-5 h-full">
              <div className="shrink-0">
                <div className="relative h-20 w-16 rounded-md bg-secondary border border-border shadow-md rotate-[-4deg] flex items-center justify-center">
                  <FileText className="h-7 w-7 text-muted-foreground" />
                </div>
              </div>
              <div className="flex-1">
                <h3 className="text-base font-semibold tracking-tight mb-1.5">
                  Slides do professor incluídos
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Anexe o PDF da aula. Lumio relaciona <Highlighter delay={0.4}>cada slide</Highlighter>{" "}
                  com o que foi falado.
                </p>
              </div>
            </div>
          </BentoCard>

          {/* Big — summary */}
          <BentoCard className="md:col-span-3 md:row-span-1 bg-gradient-to-br from-amber-500/5 via-card to-orange-500/5">
            <div className="flex items-center gap-5 h-full">
              <Clock className="h-6 w-6 text-amber-600 dark:text-amber-400 shrink-0" />
              <div className="flex-1">
                <h3 className="text-base font-semibold tracking-tight mb-1.5">
                  Revisão em <span className="font-serif italic">metade</span> do tempo
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Resumo automático com bullets centrais + Q&A. Você revisa o essencial.
                </p>
              </div>
            </div>
          </BentoCard>
        </div>
      </section>

      {/* QUOTE */}
      <section className="relative z-10 mx-auto max-w-4xl px-6 py-24">
        <Reveal>
          <div className="relative">
            <Quote className="absolute -top-4 -left-4 h-12 w-12 text-foreground/10" />
            <p className="text-2xl md:text-3xl leading-relaxed font-serif italic text-foreground/90 pl-6">
              &ldquo;Eu chegava em casa exausto, com o caderno cheio mas a cabeça vazia.
              O Lumio resolveu isso — agora eu <span className="not-italic font-sans font-medium"><Highlighter>presto atenção</Highlighter></span> e revisão fica pro fim do dia.&rdquo;
            </p>
            <div className="mt-8 flex items-center gap-3 pl-6">
              <div className="h-10 w-10 rounded-full bg-gradient-to-br from-rose-400 to-orange-400 ring-2 ring-background" />
              <div>
                <p className="text-sm font-medium">Estudante T11 — Medicina</p>
                <p className="text-xs text-muted-foreground">Beta privado · maio de 2026</p>
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      {/* FOR WHO */}
      <section id="for-who" className="relative z-10 mx-auto max-w-6xl px-6 py-24">
        <Reveal className="mb-14 max-w-2xl">
          <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground font-medium mb-4">
            — Pra quem é —
          </p>
          <h2 className="text-3xl md:text-5xl font-semibold tracking-tight">
            Feito pra quem tem{" "}
            <span className="font-serif italic font-normal">aula densa</span>.
          </h2>
        </Reveal>

        <Stagger className="grid gap-5 md:grid-cols-3">
          {PERSONAS.map((p, i) => (
            <StaggerItem key={p.title}>
              <div className={`group relative overflow-hidden rounded-xl border border-border/70 p-7 transition-all hover:-translate-y-1 hover:shadow-xl h-full ${p.bg}`}>
                <div className="flex items-start justify-between mb-6">
                  <p.icon className="h-7 w-7 text-foreground/80" />
                  <span className="editorial-num text-3xl text-foreground/15 leading-none">
                    0{i + 1}
                  </span>
                </div>
                <h3 className="font-semibold mb-2 tracking-tight">{p.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{p.desc}</p>
                <ArrowUpRight className="absolute bottom-5 right-5 h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </StaggerItem>
          ))}
        </Stagger>
      </section>

      {/* PRICING */}
      <PricingSection />

      {/* CTA */}
      <Reveal className="relative z-10 mx-auto max-w-6xl px-6 py-24">
        <div className="relative rounded-2xl border border-border/80 bg-gradient-to-br from-amber-500/5 via-card to-fuchsia-500/5 p-10 md:p-16 text-center overflow-hidden">
          <div
            className="absolute -top-32 -right-32 h-[400px] w-[400px] rounded-full opacity-25 blur-3xl"
            style={{
              background: "radial-gradient(closest-side, oklch(0.85 0.18 90 / 0.6), transparent 70%)",
            }}
          />
          <div
            className="absolute -bottom-32 -left-32 h-[400px] w-[400px] rounded-full opacity-25 blur-3xl"
            style={{
              background: "radial-gradient(closest-side, oklch(0.7 0.2 330 / 0.5), transparent 70%)",
            }}
          />
          <div className="absolute inset-0 grid-bg opacity-20" />

          <div className="relative">
            <h2 className="text-3xl md:text-5xl font-semibold tracking-tight">
              Sua próxima aula já podia estar{" "}
              <span className="font-serif italic font-normal">resumida</span>.
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
              30 segundos pra criar conta. Sem cartão. Sem download.
            </p>
            <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <Magnetic strength={0.18}>
                <Button asChild variant="gradient" size="xl" className="min-w-[240px]">
                  <Link href="/signup">
                    Criar conta grátis <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </Magnetic>
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
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 sm:flex-row">
          <LumioWordmark className="opacity-80" />
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            © {new Date().getFullYear()} Lumio · Feito com
            <Coffee className="h-3 w-3 text-amber-700" />
            pra quem estuda de verdade.
          </p>
        </div>
      </footer>
    </div>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
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

function BentoCard({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.5 }}
      className={`group relative overflow-hidden rounded-xl border border-border/70 bg-card p-6 transition-all hover:border-foreground/30 hover:shadow-xl ${className ?? ""}`}
    >
      <div className="relative h-full">{children}</div>
    </motion.div>
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

const STEPS = [
  {
    icon: BookOpen,
    title: "Crie suas matérias",
    desc: "No primeiro acesso, defina suas pastas — ou jogue uma foto da grade horária e a gente extrai pra você.",
    meta: "30 segundos",
  },
  {
    icon: Mic,
    title: "Aperte gravar na sala",
    desc: "A transcrição aparece em tempo real. Você só precisa prestar atenção na aula.",
    meta: "Tempo real",
  },
  {
    icon: FileText,
    title: "Receba o resumo pronto",
    desc: "Slides + transcrição + perguntas viram um documento organizado, na pasta da matéria.",
    meta: "Automático",
  },
];

const PERSONAS = [
  {
    icon: Stethoscope,
    title: "Medicina, Odonto, Farma",
    desc: "Aulas longas e densas. Lumio cobre as horas de teoria e te devolve o tempo de descansar.",
    bg: "bg-gradient-to-br from-rose-500/5 via-card to-pink-500/5",
  },
  {
    icon: BookOpen,
    title: "Direito, Engenharias, Humanas",
    desc: "Conceitos que voltam o tempo todo. O histórico organizado por matéria vira sua segunda memória.",
    bg: "bg-gradient-to-br from-indigo-500/5 via-card to-violet-500/5",
  },
  {
    icon: Sparkles,
    title: "Pós, MBA, concursos",
    desc: "Você não tem tempo de assistir aula gravada duas vezes. Resumo correlacionado entrega o essencial.",
    bg: "bg-gradient-to-br from-emerald-500/5 via-card to-teal-500/5",
  },
];

const BULLETS = [
  "Sem cartão de crédito",
  "Beta aberto",
  "Transcrição ilimitada",
  "Funciona no celular",
];
