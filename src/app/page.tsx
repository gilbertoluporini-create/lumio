"use client";

import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Clock,
  Coffee,
  FileText,
  FolderTree,
  Heart,
  Highlighter,
  Mic,
  Quote,
  Sparkles,
  Stethoscope,
  Waves,
  Zap,
} from "lucide-react";
import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LumioWordmark } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  CountUp,
  FloatingOrbs,
  MarqueeRow,
  Reveal,
  Stagger,
  StaggerItem,
} from "@/components/landing/motion";
import { AppPreview } from "@/components/landing/app-preview";

export default function LandingPage() {
  const heroRef = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ["start start", "end start"],
  });
  const heroOpacity = useTransform(scrollYProgress, [0, 1], [1, reduce ? 1 : 0.2]);
  const heroY = useTransform(scrollYProgress, [0, 1], [0, reduce ? 0 : -80]);

  return (
    <div className="relative min-h-screen overflow-x-hidden">
      {/* Backgrounds */}
      <div className="pointer-events-none fixed inset-0 grid-bg opacity-60" />
      <FloatingOrbs />

      {/* Nav */}
      <motion.header
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="sticky top-0 z-30 backdrop-blur-xl bg-background/60 border-b border-border/40"
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
            <Button asChild variant="gradient" size="sm">
              <Link href="/signup">
                Começar grátis <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        </nav>
      </motion.header>

      {/* Hero */}
      <section
        ref={heroRef}
        className="relative z-10 mx-auto max-w-6xl px-6 pt-20 pb-24 md:pt-28 md:pb-32 text-center"
      >
        <motion.div style={{ opacity: heroOpacity, y: heroY }}>
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.1, duration: 0.6, ease: "easeOut" }}
          >
            <Badge
              variant="outline"
              className="mb-7 rounded-full border-border/60 bg-background/60 backdrop-blur-md px-3.5 py-1.5 gap-1.5"
            >
              <Heart className="h-3 w-3 text-rose-500" />
              <span className="text-xs">Pra estudantes que querem prestar atenção, não tomar nota</span>
            </Badge>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.7, ease: [0.21, 0.47, 0.32, 0.98] }}
            className="mx-auto max-w-4xl text-5xl font-semibold tracking-tight md:text-7xl"
          >
            Volte a <span className="gradient-text">olhar pro professor</span>.
            <br />
            <span className="text-foreground/80">A gente cuida do resto.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.6 }}
            className="mx-auto mt-7 max-w-2xl text-lg text-muted-foreground md:text-xl leading-relaxed"
          >
            Lumio escuta a aula, transcreve em português, responde suas dúvidas
            sobre o que está sendo dito, e te entrega um resumo organizado por
            matéria. Sem app pra instalar.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.55, duration: 0.6 }}
            className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row"
          >
            <Button asChild variant="gradient" size="xl" className="min-w-[220px] group">
              <Link href="/signup">
                Começar grátis
                <motion.span
                  className="inline-flex"
                  initial={{ x: 0 }}
                  whileHover={{ x: 4 }}
                >
                  <ArrowRight className="h-4 w-4" />
                </motion.span>
              </Link>
            </Button>
            <Button asChild variant="outline" size="xl" className="min-w-[220px]">
              <Link href="#how">Ver como funciona</Link>
            </Button>
          </motion.div>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8, duration: 0.6 }}
            className="mt-5 text-xs text-muted-foreground"
          >
            Sem cartão de crédito · Funciona no Chrome, Edge e Safari
          </motion.p>
        </motion.div>

        <AppPreview />
      </section>

      {/* Marquee de detalhes */}
      <section className="relative z-10 border-y border-border/40 bg-card/30 backdrop-blur py-5">
        <MarqueeRow
          speed={50}
          items={[
            "Reconhecimento de voz nativo do navegador",
            "Zero upload — privacidade por padrão",
            "Português brasileiro de verdade",
            "Anexe PDF da aula e a IA correlaciona",
            "Organizado por matéria, sempre",
            "Resumo automático ao final da aula",
            "Histórico ilimitado",
            "Exporta em Markdown",
          ]}
        />
      </section>

      {/* Stats */}
      <section className="relative z-10 mx-auto max-w-6xl px-6 py-20">
        <Stagger className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {STATS.map((s) => (
            <StaggerItem key={s.label} className="text-center">
              <div className="text-4xl md:text-5xl font-semibold tracking-tight gradient-text mb-2">
                {typeof s.value === "number" ? (
                  <CountUp to={s.value} suffix={s.suffix ?? ""} />
                ) : (
                  s.value
                )}
              </div>
              <p className="text-sm text-muted-foreground">{s.label}</p>
            </StaggerItem>
          ))}
        </Stagger>
      </section>

      {/* How it works */}
      <section id="how" className="relative z-10 mx-auto max-w-6xl px-6 py-24">
        <Reveal className="text-center mb-16">
          <Badge variant="outline" className="mb-4 rounded-full bg-background/60 backdrop-blur">
            Como funciona
          </Badge>
          <h2 className="text-3xl font-semibold tracking-tight md:text-5xl">
            Três passos. <span className="gradient-text">Zero fricção</span>.
          </h2>
        </Reveal>

        <Stagger className="grid gap-6 md:grid-cols-3" gap={0.15}>
          {STEPS.map((s, i) => (
            <StaggerItem key={s.title}>
              <div className="group relative h-full rounded-xl border border-border/70 bg-card/60 backdrop-blur p-6 transition-all hover:border-primary/40 hover:bg-card hover:shadow-xl">
                <div className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" style={{
                  background: "radial-gradient(circle at 50% 0%, oklch(0.6 0.22 290 / 0.10), transparent 65%)",
                }} />
                <div className="relative">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="relative flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-primary to-violet-500 text-base font-semibold text-primary-foreground shadow-md">
                      {i + 1}
                      <motion.span
                        className="absolute inset-0 rounded-full bg-primary/30"
                        animate={{ scale: [1, 1.4, 1], opacity: [0.6, 0, 0.6] }}
                        transition={{
                          duration: 2.5,
                          repeat: Infinity,
                          delay: i * 0.7,
                          ease: "easeOut",
                        }}
                      />
                    </div>
                    <s.icon className="h-5 w-5 text-primary/70" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">{s.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{s.desc}</p>
                </div>
              </div>
            </StaggerItem>
          ))}
        </Stagger>
      </section>

      {/* Features */}
      <section id="features" className="relative z-10 mx-auto max-w-6xl px-6 py-24">
        <Reveal className="text-center mb-14">
          <Badge variant="outline" className="mb-4 rounded-full bg-background/60 backdrop-blur">
            O que você ganha
          </Badge>
          <h2 className="text-3xl font-semibold tracking-tight md:text-5xl">
            Pequenos hábitos. <span className="gradient-text">Grandes diferenças</span>.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
            Cada detalhe pensado pra quem assiste 4 horas de aula por dia.
          </p>
        </Reveal>

        <Stagger className="grid gap-4 md:grid-cols-2 lg:grid-cols-3" gap={0.07}>
          {FEATURES.map((f) => (
            <StaggerItem key={f.title}>
              <FeatureCard f={f} />
            </StaggerItem>
          ))}
        </Stagger>
      </section>

      {/* Quote section */}
      <Reveal className="relative z-10 mx-auto max-w-3xl px-6 py-20 text-center">
        <Quote className="mx-auto h-8 w-8 text-primary/40 mb-4" />
        <p className="text-2xl md:text-3xl font-medium leading-relaxed">
          &ldquo;Eu chegava em casa exausto, com o caderno cheio mas a cabeça vazia.
          O Lumio resolveu isso — agora eu <span className="gradient-text">presto atenção</span> e
          revisão fica pro fim do dia.&rdquo;
        </p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <div className="h-9 w-9 rounded-full bg-gradient-to-br from-rose-400 to-orange-400" />
          <div className="text-left">
            <p className="text-sm font-medium">Estudante T11 — Medicina</p>
            <p className="text-xs text-muted-foreground">Beta privado</p>
          </div>
        </div>
      </Reveal>

      {/* For who */}
      <section id="for-who" className="relative z-10 mx-auto max-w-6xl px-6 py-24">
        <Reveal className="text-center mb-14">
          <Badge variant="outline" className="mb-4 rounded-full bg-background/60 backdrop-blur">
            Pra quem é
          </Badge>
          <h2 className="text-3xl font-semibold tracking-tight md:text-5xl">
            Feito pra quem tem <span className="gradient-text">aula densa</span>.
          </h2>
        </Reveal>

        <Stagger className="grid gap-5 md:grid-cols-3">
          {PERSONAS.map((p) => (
            <StaggerItem key={p.title}>
              <div className={`group relative overflow-hidden rounded-xl border border-border/70 p-6 transition-all hover:-translate-y-1 hover:shadow-xl ${p.bg}`}>
                <p.icon className="h-7 w-7 mb-4 text-foreground/80" />
                <h3 className="font-semibold mb-2">{p.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{p.desc}</p>
              </div>
            </StaggerItem>
          ))}
        </Stagger>
      </section>

      {/* Final CTA */}
      <Reveal className="relative z-10 mx-auto max-w-6xl px-6 py-24">
        <div className="relative rounded-2xl border border-border/80 bg-gradient-to-br from-primary/10 via-card to-fuchsia-500/10 p-10 md:p-16 text-center overflow-hidden">
          <motion.div
            className="absolute -top-32 -right-32 h-[400px] w-[400px] rounded-full opacity-40 blur-3xl"
            style={{
              background: "radial-gradient(closest-side, oklch(0.6 0.25 290 / 0.6), transparent 70%)",
            }}
            animate={{ scale: [1, 1.1, 1] }}
            transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.div
            className="absolute -bottom-32 -left-32 h-[400px] w-[400px] rounded-full opacity-40 blur-3xl"
            style={{
              background: "radial-gradient(closest-side, oklch(0.7 0.2 330 / 0.6), transparent 70%)",
            }}
            animate={{ scale: [1.1, 1, 1.1] }}
            transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
          />
          <div className="absolute inset-0 grid-bg opacity-30" />

          <div className="relative">
            <h2 className="text-3xl font-semibold tracking-tight md:text-5xl">
              Sua próxima aula <span className="gradient-text">já podia estar resumida</span>.
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
              Crie sua conta em 30 segundos. Sem cartão, sem download.
            </p>
            <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <Button asChild variant="gradient" size="xl" className="min-w-[240px]">
                <Link href="/signup">
                  Criar conta grátis <ArrowRight className="h-4 w-4" />
                </Link>
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

      {/* Footer */}
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

function FeatureCard({ f }: { f: (typeof FEATURES)[number] }) {
  return (
    <div className="group relative h-full overflow-hidden rounded-xl border border-border/70 bg-card/60 backdrop-blur p-6 transition-all hover:border-primary/40 hover:bg-card hover:shadow-xl hover:-translate-y-0.5">
      <motion.div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
        style={{
          background:
            "radial-gradient(circle at top right, oklch(0.6 0.22 290 / 0.10), transparent 60%)",
        }}
      />
      <div className="relative">
        <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20 group-hover:scale-110 transition-transform">
          <f.icon className="h-5 w-5" />
        </div>
        <h3 className="text-base font-semibold">{f.title}</h3>
        <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
      </div>
    </div>
  );
}

const STATS: Array<{ value: number | string; suffix?: string; label: string }> = [
  { value: 0, suffix: "ms", label: "Latência da transcrição" },
  { value: "∞", label: "Aulas no histórico" },
  { value: 100, suffix: "%", label: "Em português" },
  { value: 30, suffix: "s", label: "Pra criar conta" },
];

const STEPS = [
  {
    icon: BookOpen,
    title: "Crie suas matérias",
    desc: "No primeiro acesso, defina suas pastas — ou jogue uma foto da grade horária e a gente extrai pra você.",
  },
  {
    icon: Mic,
    title: "Aperte gravar na sala",
    desc: "A transcrição aparece na sua tela em tempo real. Você só precisa prestar atenção na aula.",
  },
  {
    icon: FileText,
    title: "Receba o resumo pronto",
    desc: "Ao final, slides + transcrição + perguntas viram um documento organizado, na pasta da matéria.",
  },
];

const FEATURES = [
  {
    icon: Mic,
    title: "Transcrição que não falha",
    desc: "Reconhecimento nativo do navegador, otimizado pra português. Sem upload, sem latência perceptível.",
  },
  {
    icon: Highlighter,
    title: "Pergunte enquanto rola",
    desc: "Sem entender algo? Pergunte no chat. A IA enxerga tudo que foi dito até agora e responde no contexto.",
  },
  {
    icon: FolderTree,
    title: "Tudo no seu lugar",
    desc: "Cada aula vai pra pasta da matéria. Procurar fica simples — não vira aquele cemitério de PDFs.",
  },
  {
    icon: Waves,
    title: "Slides do professor incluídos",
    desc: "Anexe o PDF da aula. Lumio relaciona cada slide com o que foi falado e gera um resumo correlacionado.",
  },
  {
    icon: Clock,
    title: "Revisão em metade do tempo",
    desc: "Resumo automático com bullets centrais e perguntas/respostas. Você revisa o essencial antes da prova.",
  },
  {
    icon: Zap,
    title: "Sem fricção, nunca",
    desc: "Stack moderna, sem telas brancas. Funciona no celular, no notebook ou no iPad — sem app pra instalar.",
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
