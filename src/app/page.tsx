import Link from "next/link";
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  FolderTree,
  Mic,
  Sparkles,
  Waves,
  Zap,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LumioWordmark } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme-toggle";

export default function LandingPage() {
  return (
    <div className="relative min-h-screen overflow-x-hidden">
      <div className="pointer-events-none absolute inset-0 grid-bg" />
      <div
        className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 h-[640px] w-[1200px] opacity-50 blur-3xl"
        style={{
          background:
            "radial-gradient(closest-side, oklch(0.6 0.25 290 / 0.45), transparent 70%)",
        }}
      />

      <header className="relative z-20">
        <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <Link href="/" className="flex items-center">
            <LumioWordmark />
          </Link>
          <div className="hidden items-center gap-7 md:flex">
            <Link href="#features" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Recursos
            </Link>
            <Link href="#how-it-works" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Como funciona
            </Link>
            <Link href="#pricing" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Preços
            </Link>
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
      </header>

      <section className="relative z-10 mx-auto max-w-6xl px-6 pt-16 pb-24 md:pt-24 md:pb-32 text-center">
        <Badge variant="outline" className="mb-7 rounded-full border-border/60 bg-background/60 backdrop-blur-md px-3.5 py-1.5 gap-1.5">
          <Sparkles className="h-3 w-3 text-primary" />
          <span className="text-xs">Powered by Claude · Transcrição em tempo real</span>
        </Badge>

        <h1 className="mx-auto max-w-4xl text-5xl font-semibold tracking-tight md:text-7xl">
          Sua aula <span className="gradient-text">transcrita</span>.
          <br />
          Suas dúvidas <span className="gradient-text">respondidas</span>.
        </h1>

        <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground md:text-xl">
          Lumio escuta sua aula, transcreve em tempo real e responde suas perguntas
          com base no que está sendo dito. Tudo organizado em pastas por matéria.
        </p>

        <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button asChild variant="gradient" size="xl" className="min-w-[200px]">
            <Link href="/signup">
              Começar grátis <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button asChild variant="outline" size="xl" className="min-w-[200px]">
            <Link href="#how-it-works">Ver como funciona</Link>
          </Button>
        </div>

        <p className="mt-5 text-xs text-muted-foreground">
          Sem cartão de crédito · Funciona no Chrome, Edge e Safari
        </p>

        <div className="relative mx-auto mt-16 max-w-5xl">
          <div className="rounded-2xl border border-border/80 bg-card/80 p-1 shadow-2xl backdrop-blur-xl glow-primary">
            <div className="rounded-xl border border-border/40 bg-background overflow-hidden">
              <div className="flex items-center gap-1.5 border-b border-border/60 px-4 py-3">
                <div className="h-3 w-3 rounded-full bg-red-400/80" />
                <div className="h-3 w-3 rounded-full bg-yellow-400/80" />
                <div className="h-3 w-3 rounded-full bg-emerald-400/80" />
                <div className="ml-3 flex-1 text-center text-xs text-muted-foreground font-mono">
                  lumio.app/lecture/anatomia-suprarrenais
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-[1.4fr_1fr] divide-x divide-border/60 min-h-[380px]">
                <div className="p-6 text-left">
                  <div className="mb-4 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant="live" className="gap-1.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-red-500 pulse-dot" />
                        AO VIVO · 12:34
                      </Badge>
                      <span className="text-xs text-muted-foreground">Anatomia</span>
                    </div>
                    <Mic className="h-4 w-4 text-primary" />
                  </div>
                  <h3 className="text-base font-semibold">Aula de Suprarrenais</h3>
                  <div className="mt-4 space-y-3 text-sm leading-relaxed text-muted-foreground">
                    <p>
                      As glândulas suprarrenais são pequenas estruturas localizadas
                      sobre cada rim, no espaço retroperitoneal...
                    </p>
                    <p>
                      A suprarrenal direita tem formato piramidal, enquanto a esquerda
                      apresenta formato semilunar. Ambas mantêm contato direto com o
                      diafragma...
                    </p>
                    <p className="text-foreground">
                      <span className="shimmer rounded px-1">
                        Sua vascularização é feita por três artérias principais: as suprarrenais...
                      </span>
                    </p>
                  </div>
                </div>
                <div className="bg-secondary/30 p-6 text-left">
                  <div className="mb-4 flex items-center gap-2">
                    <Bot className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">Chat com a aula</span>
                  </div>
                  <div className="space-y-3 text-sm">
                    <div className="rounded-lg bg-background border border-border/60 p-3">
                      <p className="text-xs text-muted-foreground mb-1">Você</p>
                      <p>Qual a diferença de formato entre as duas?</p>
                    </div>
                    <div className="rounded-lg bg-primary/10 border border-primary/20 p-3">
                      <p className="text-xs text-primary mb-1 font-medium">Lumio</p>
                      <p>A direita é <strong>piramidal</strong> e a esquerda <strong>semilunar</strong>, como acabou de ser mencionado na aula.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="relative z-10 mx-auto max-w-6xl px-6 py-24">
        <div className="text-center">
          <Badge variant="outline" className="mb-4 rounded-full bg-background/60 backdrop-blur">
            Recursos
          </Badge>
          <h2 className="text-3xl font-semibold tracking-tight md:text-5xl">
            Tudo o que você precisa pra <span className="gradient-text">não perder nada</span>.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
            Construído pra estudantes que querem revisar com qualidade e conversar com o conteúdo.
          </p>
        </div>

        <div className="mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div
              key={f.title}
              className="group relative overflow-hidden rounded-xl border border-border/80 bg-card/60 p-6 transition-all hover:border-primary/40 hover:bg-card hover:shadow-lg hover:-translate-y-0.5"
            >
              <div className="absolute inset-0 opacity-0 transition-opacity group-hover:opacity-100" style={{
                background: "radial-gradient(circle at top right, oklch(0.6 0.22 290 / 0.08), transparent 60%)",
              }} />
              <div className="relative">
                <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20">
                  <f.icon className="h-5 w-5" />
                </div>
                <h3 className="text-base font-semibold">{f.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section id="how-it-works" className="relative z-10 mx-auto max-w-6xl px-6 py-24">
        <div className="text-center">
          <Badge variant="outline" className="mb-4 rounded-full bg-background/60 backdrop-blur">
            Como funciona
          </Badge>
          <h2 className="text-3xl font-semibold tracking-tight md:text-5xl">
            Três passos. <span className="gradient-text">Zero fricção</span>.
          </h2>
        </div>

        <div className="mt-14 grid gap-8 md:grid-cols-3">
          {steps.map((s, i) => (
            <div key={s.title} className="relative">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-primary to-violet-500 text-sm font-semibold text-primary-foreground shadow-md">
                  {i + 1}
                </div>
                <h3 className="text-lg font-semibold">{s.title}</h3>
              </div>
              <p className="mt-3 text-sm text-muted-foreground leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="pricing" className="relative z-10 mx-auto max-w-6xl px-6 py-24">
        <div className="rounded-2xl border border-border/80 bg-gradient-to-br from-primary/5 via-card to-fuchsia-500/5 p-10 md:p-16 text-center overflow-hidden relative">
          <div className="absolute inset-0 grid-bg opacity-50" />
          <div className="relative">
            <h2 className="text-3xl font-semibold tracking-tight md:text-5xl">
              Comece grátis. <span className="gradient-text">Sem complicação</span>.
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
              Use sem limite durante o beta. Quando lançarmos os planos pagos, você terá
              um desconto vitalício pra sempre.
            </p>
            <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <Button asChild variant="gradient" size="xl" className="min-w-[220px]">
                <Link href="/signup">
                  Criar conta grátis <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm text-muted-foreground">
              {bullets.map((b) => (
                <div key={b} className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-primary" /> {b}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <footer className="relative z-10 border-t border-border/60 mt-16">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 sm:flex-row">
          <LumioWordmark className="opacity-80" />
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} Lumio · Feito com ☕ pra quem estuda de verdade.
          </p>
        </div>
      </footer>
    </div>
  );
}

const features = [
  {
    icon: Mic,
    title: "Transcrição ao vivo",
    desc: "Reconhecimento de voz nativo do navegador. Funciona em português, sem upload, sem latência.",
  },
  {
    icon: Bot,
    title: "Chat com contexto",
    desc: "Pergunte qualquer coisa durante a aula. A IA enxerga toda a transcrição e responde com precisão.",
  },
  {
    icon: FolderTree,
    title: "Organizado por matéria",
    desc: "Crie pastas no onboarding. Cada aula gravada vai direto pra matéria certa. Achar é fácil.",
  },
  {
    icon: Waves,
    title: "Histórico completo",
    desc: "Transcrição + chat ficam salvos. Volte semanas depois e continue a conversa de onde parou.",
  },
  {
    icon: Zap,
    title: "Rápido como deve ser",
    desc: "Stack moderna. Interface responsiva. Sem telas brancas, sem espera.",
  },
  {
    icon: ShieldCheck,
    title: "Seus dados, sua casa",
    desc: "Armazenamento local por padrão. Quando ativar Supabase, sincroniza entre dispositivos.",
  },
];

const steps = [
  {
    title: "Crie suas matérias",
    desc: "No onboarding, defina as matérias do seu semestre. Ex: Anatomia, Fisiologia, Bioquímica.",
  },
  {
    title: "Inicie a gravação",
    desc: "Na sala de aula, abra o Lumio, escolha a matéria e dê play. Tudo é transcrito em tempo real.",
  },
  {
    title: "Pergunte e revise",
    desc: "Use o chat lateral pra tirar dúvidas durante (ou depois) da aula. Tudo fica salvo na pasta.",
  },
];

const bullets = [
  "Sem cartão de crédito",
  "Beta aberto",
  "Transcrição ilimitada",
  "Chat com Claude",
];
