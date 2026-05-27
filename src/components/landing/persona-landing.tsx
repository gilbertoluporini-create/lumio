import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LumioWordmark } from "@/components/brand/logo";
import { LumioCoin } from "@/components/brand/lumio-coin";

export type PersonaSlug =
  | "para-medicina"
  | "para-direito"
  | "para-administracao"
  | "para-engenharia"
  | "para-psicologia";

export type PersonaLandingProps = {
  slug: PersonaSlug;
  courseName: string;
  courseLabel: string;
  heroTitle: string;
  heroSub: string;
  pains: string[];
  subjects: string[];
  solutionLead: string;
  demoTitle: string;
  demoExample: {
    inputLabel: string;
    inputText: string;
    outputs: { title: string; body: string }[];
  };
  faqs: { q: string; a: string }[];
  closingLine: string;
};

const ALL_PERSONAS: { slug: PersonaSlug; label: string }[] = [
  { slug: "para-medicina", label: "Medicina" },
  { slug: "para-direito", label: "Direito" },
  { slug: "para-administracao", label: "Administração" },
  { slug: "para-engenharia", label: "Engenharia" },
  { slug: "para-psicologia", label: "Psicologia" },
];

const PRICING = [
  { name: "Starter", price: "R$ 39", tag: "200 coins/mês", note: "Aulas regulares" },
  { name: "Pro", price: "R$ 69", tag: "500 coins/mês", note: "Estuda todo dia", highlight: true },
  { name: "Power", price: "R$ 119", tag: "1500 coins/mês", note: "Revisão pesada" },
];

export function PersonaLanding(props: PersonaLandingProps) {
  const {
    slug,
    courseName,
    courseLabel,
    heroTitle,
    heroSub,
    pains,
    subjects,
    solutionLead,
    demoTitle,
    demoExample,
    faqs,
    closingLine,
  } = props;

  const otherPersonas = ALL_PERSONAS.filter((p) => p.slug !== slug);

  return (
    <div className="relative min-h-screen overflow-x-clip">
      {/* NAV */}
      <header className="sticky top-0 z-30 backdrop-blur-md bg-background/85 border-b border-border/40">
        <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3.5">
          <Link href="/" className="flex items-center">
            <LumioWordmark />
          </Link>
          <div className="hidden items-center gap-7 md:flex">
            <Link
              href="/#how"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Como funciona
            </Link>
            <Link
              href="/#products"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Produtos
            </Link>
            <Link
              href="/#pricing"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Planos
            </Link>
            <Link
              href="/#faq"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              FAQ
            </Link>
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="hidden sm:inline-flex"
            >
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

      {/* HERO */}
      <section className="relative z-10 mx-auto max-w-5xl px-6 pt-16 pb-16 md:pt-24 md:pb-20">
        <div className="mb-6 inline-flex items-center gap-2.5 rounded-full border border-border/60 bg-card/60 px-3 py-1">
          <span className="inline-flex h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
          <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-medium">
            Lumio · {courseLabel}
          </span>
        </div>

        <h1 className="text-[40px] sm:text-5xl md:text-6xl font-semibold leading-[1.05] tracking-[-0.025em]">
          {heroTitle}
        </h1>

        <p className="mt-6 max-w-2xl text-lg text-muted-foreground leading-relaxed">
          {heroSub}
        </p>

        <div className="mt-8 flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <Button asChild variant="gradient" size="xl" className="min-w-[220px]">
            <Link href="/signup">
              Comece grátis <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <div className="inline-flex items-center gap-2 text-xs text-muted-foreground">
            <LumioCoin size={14} />
            <span>
              <span className="text-foreground font-medium">50 coins</span> ao
              criar conta · sem cartão
            </span>
          </div>
        </div>
      </section>

      {/* DOR ESPECÍFICA */}
      <section className="relative z-10 border-t border-border/40">
        <div className="mx-auto max-w-5xl px-6 py-16 md:py-20">
          <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground font-medium mb-4">
            — A dor de {courseLabel.toLowerCase()} —
          </p>
          <h2 className="text-3xl md:text-4xl font-semibold tracking-[-0.025em] max-w-2xl">
            O problema não é falta de esforço.
          </h2>
          <ul className="mt-8 grid gap-4 md:grid-cols-3">
            {pains.map((pain) => (
              <li
                key={pain}
                className="rounded-2xl border border-border/60 bg-card p-5 text-sm leading-relaxed text-foreground/85"
              >
                {pain}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* COMO O LUMIO RESOLVE */}
      <section className="relative z-10 border-t border-border/40 bg-muted/20">
        <div className="mx-auto max-w-5xl px-6 py-16 md:py-20">
          <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground font-medium mb-4">
            — Como o Lumio resolve —
          </p>
          <h2 className="text-3xl md:text-4xl font-semibold tracking-[-0.025em] max-w-2xl">
            {solutionLead}
          </h2>

          <div className="mt-10 grid gap-3 md:grid-cols-4">
            {subjects.map((subject) => (
              <div
                key={subject}
                className="rounded-xl border border-border/60 bg-card px-4 py-3 text-sm font-medium text-foreground/90 text-center"
              >
                {subject}
              </div>
            ))}
          </div>

          <p className="mt-8 text-sm text-muted-foreground max-w-xl">
            Cada aula vira material organizado por disciplina, com termos e
            conceitos preservados do jeito que o professor usou.
          </p>
        </div>
      </section>

      {/* MINI DEMO */}
      <section className="relative z-10 border-t border-border/40">
        <div className="mx-auto max-w-5xl px-6 py-16 md:py-20">
          <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground font-medium mb-4">
            — Exemplo prático —
          </p>
          <h2 className="text-3xl md:text-4xl font-semibold tracking-[-0.025em] max-w-2xl">
            {demoTitle}
          </h2>

          <div className="mt-10 grid gap-4 lg:grid-cols-[1fr_1.4fr] items-start">
            <div className="rounded-2xl border border-border/70 bg-card p-6">
              <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-semibold mb-3">
                {demoExample.inputLabel}
              </p>
              <p className="text-sm leading-relaxed text-foreground/85">
                {demoExample.inputText}
              </p>
            </div>

            <div className="grid gap-3">
              {demoExample.outputs.map((out) => (
                <div
                  key={out.title}
                  className="rounded-2xl border border-primary/30 bg-primary/5 p-5"
                >
                  <p className="text-xs font-semibold text-primary mb-2 inline-flex items-center gap-2">
                    <span className="inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
                    {out.title}
                  </p>
                  <p className="text-sm leading-relaxed text-foreground/85">
                    {out.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* PRICING INLINE */}
      <section className="relative z-10 border-t border-border/40 bg-muted/20">
        <div className="mx-auto max-w-5xl px-6 py-16 md:py-20">
          <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground font-medium mb-4">
            — Planos —
          </p>
          <h2 className="text-3xl md:text-4xl font-semibold tracking-[-0.025em] max-w-2xl">
            Comece grátis. Suba quando precisar.
          </h2>
          <p className="mt-3 text-sm text-muted-foreground">
            50 coins de boas-vindas, sem cartão de crédito.
          </p>

          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {PRICING.map((plan) => (
              <div
                key={plan.name}
                className={`relative rounded-2xl border bg-card p-6 ${
                  plan.highlight
                    ? "border-primary/60 ring-1 ring-primary/30"
                    : "border-border/70"
                }`}
              >
                {plan.highlight && (
                  <Badge className="absolute -top-2 right-4">Popular</Badge>
                )}
                <p className="text-sm font-semibold tracking-tight">{plan.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{plan.note}</p>
                <div className="mt-4 flex items-baseline gap-1.5">
                  <span className="text-3xl font-semibold tracking-tight">
                    {plan.price}
                  </span>
                  <span className="text-sm text-muted-foreground">/mês</span>
                </div>
                <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary">
                  <LumioCoin size={14} /> {plan.tag}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-8 flex flex-col sm:flex-row gap-3 items-start sm:items-center">
            <Button asChild variant="gradient" size="lg">
              <Link href="/signup">
                Comece grátis <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="ghost" size="lg">
              <Link href="/#pricing">Ver planos completos</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="relative z-10 border-t border-border/40">
        <div className="mx-auto max-w-3xl px-6 py-16 md:py-20">
          <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground font-medium mb-4">
            — Perguntas frequentes —
          </p>
          <h2 className="text-3xl md:text-4xl font-semibold tracking-[-0.025em]">
            Sobre o Lumio pra {courseLabel.toLowerCase()}.
          </h2>

          <div className="mt-10 divide-y divide-border/60 border-y border-border/60">
            {faqs.map((f) => (
              <details
                key={f.q}
                className="group py-5 cursor-pointer [&_summary::-webkit-details-marker]:hidden"
              >
                <summary className="flex items-center justify-between gap-4 text-base font-medium text-foreground">
                  <span>{f.q}</span>
                  <span className="text-muted-foreground transition-transform group-open:rotate-45 text-xl leading-none">
                    +
                  </span>
                </summary>
                <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
                  {f.a}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* CTA FINAL */}
      <section className="relative z-10 border-t border-border/40">
        <div className="mx-auto max-w-5xl px-6 py-16 md:py-24">
          <div className="rounded-3xl border border-border/80 bg-card p-10 md:p-16 text-center">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-background px-3 py-1">
              <LumioCoin size={14} />
              <span className="text-[11px] uppercase tracking-wider text-primary font-medium">
                50 coins de boas-vindas
              </span>
            </div>
            <h2 className="text-3xl md:text-5xl font-bold tracking-[-0.025em] max-w-2xl mx-auto">
              {closingLine}
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-muted-foreground">
              30 segundos pra criar conta. Sem cartão. Sem download.
            </p>
            <div className="mt-9 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <Button asChild variant="gradient" size="xl" className="min-w-[240px]">
                <Link href="/signup">
                  Comece grátis <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="ghost" size="xl">
                <Link href="/#how">Como funciona</Link>
              </Button>
            </div>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <Check className="h-4 w-4 text-primary" /> Sem cartão de crédito
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Check className="h-4 w-4 text-primary" /> 50 coins grátis
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Check className="h-4 w-4 text-primary" /> Cancele a qualquer hora
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* CROSS-PROMOTE */}
      <section className="relative z-10 border-t border-border/40 bg-muted/20">
        <div className="mx-auto max-w-5xl px-6 py-12">
          <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground font-medium mb-4">
            — Lumio pra outros cursos —
          </p>
          <div className="flex flex-wrap gap-3">
            {otherPersonas.map((p) => (
              <Link
                key={p.slug}
                href={`/${p.slug}`}
                className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-card px-4 py-2 text-sm font-medium text-foreground/85 hover:border-primary/50 hover:text-foreground transition-colors"
              >
                Lumio pra {p.label}
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
              </Link>
            ))}
          </div>
        </div>
      </section>

      <footer className="relative z-10 border-t border-border/40">
        <div className="mx-auto max-w-5xl px-6 py-10 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} Lumio · Transcrição e IA pra aulas
            universitárias.
          </p>
          <div className="flex items-center gap-5 text-xs">
            <Link
              href="/terms"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              Termos
            </Link>
            <Link
              href="/privacy"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              Privacidade
            </Link>
            <Link
              href="/"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              Página inicial
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

/**
 * Gera JSON-LD Schema.org para a landing de persona.
 * Tipo "Product" porque a página posiciona o Lumio como produto pra o nicho.
 */
export function personaJsonLd(opts: {
  name: string;
  description: string;
  url: string;
  courseName: string;
  image?: string;
}) {
  const { name, description, url, courseName, image } = opts;
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name,
    description,
    url,
    ...(image ? { image: [image] } : {}),
    brand: { "@type": "Brand", name: "Lumio" },
    category: `Software educacional para ${courseName}`,
    offers: {
      "@type": "AggregateOffer",
      priceCurrency: "BRL",
      lowPrice: "0",
      highPrice: "119",
      offerCount: 4,
      availability: "https://schema.org/InStock",
      url: `${url}#pricing`,
    },
    audience: {
      "@type": "EducationalAudience",
      educationalRole: `Estudante de ${courseName}`,
    },
  };
}
