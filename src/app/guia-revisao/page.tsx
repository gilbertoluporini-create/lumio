"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, CheckCircle2, Download, FileText, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trackEvent, identifyUser } from "@/lib/analytics";

const PDF_PATH = "/guia-revisao-prova.pdf";

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success"; pdfUrl: string }
  | { kind: "error"; message: string };

const STEPS = [
  {
    n: "01",
    title: "Transcreva sem anotar",
    body: "Sua mão copiando tira você do contexto. Grave a aula, foque no professor, organize depois.",
  },
  {
    n: "02",
    title: "Resumo + flashcards",
    body: "Vence a curva do esquecimento com material que a IA gera direto da transcrição.",
  },
  {
    n: "03",
    title: "Quiz pré-prova",
    body: "Active recall nos 3 dias antes da prova — o que de verdade fixa o conteúdo.",
  },
];

export default function GuiaRevisaoPage() {
  const [email, setEmail] = useState("");
  const [lgpd, setLgpd] = useState(false);
  const [state, setState] = useState<State>({ kind: "idle" });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (state.kind === "loading") return;

    const cleaned = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned)) {
      setState({ kind: "error", message: "Coloca um email válido." });
      return;
    }
    if (!lgpd) {
      setState({ kind: "error", message: "Aceite os termos pra continuar." });
      return;
    }

    setState({ kind: "loading" });

    try {
      const res = await fetch("/api/leads/magnet", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: cleaned, lgpd: true }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        pdfUrl?: string;
        error?: string;
      };

      if (!res.ok || !json.ok) {
        setState({
          kind: "error",
          message: json.error || "Não rolou agora. Tenta de novo em alguns segundos.",
        });
        return;
      }

      // Tracking client-side: GA4 + Meta Pixel + PostHog
      try {
        identifyUser({ id: cleaned, email: cleaned });
        trackEvent("generate_lead", {
          source: "guia-revisao",
          magnet: "guia_revisao",
        });
      } catch {
        /* analytics nunca derruba UX */
      }

      const pdfUrl = json.pdfUrl ?? PDF_PATH;
      setState({ kind: "success", pdfUrl });

      // auto-download em new tab pra usuário não perder
      try {
        window.open(pdfUrl, "_blank", "noopener,noreferrer");
      } catch {
        /* ignore */
      }
    } catch {
      setState({
        kind: "error",
        message: "Erro de conexão. Tenta de novo.",
      });
    }
  }

  return (
    <main className="relative min-h-screen overflow-x-clip bg-background">
      {/* gradient bg */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_70%_50%_at_50%_-10%,oklch(0.85_0.15_290/0.35),transparent_70%)]"
      />
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_60%_40%_at_50%_110%,oklch(0.78_0.18_320/0.25),transparent_70%)]"
      />

      <header className="mx-auto flex max-w-2xl items-center justify-between px-6 py-5">
        <Link href="/" className="text-base font-semibold tracking-tight">
          Lumio
        </Link>
        <Link
          href="/login"
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Entrar
        </Link>
      </header>

      <section className="mx-auto max-w-2xl px-6 pt-10 pb-24">
        {/* eyebrow */}
        <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/60 px-3 py-1">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-medium">
            E-book gratuito · 4 páginas
          </span>
        </div>

        <h1 className="text-display text-4xl sm:text-5xl font-semibold leading-[1.05] tracking-tight">
          Guia de Revisão da{" "}
          <span className="gradient-text font-bold">Semana de Prova</span>
        </h1>

        <p className="mt-5 text-lg text-muted-foreground leading-relaxed max-w-xl">
          Como organizar 4 horas de aula em 40 minutos de estudo focado — em 3 passos
          que funcionam pra qualquer curso e qualquer matéria densa.
        </p>

        {/* form card */}
        <div className="mt-9 rounded-2xl border border-border/60 bg-card/80 backdrop-blur p-6 sm:p-7 shadow-sm">
          {state.kind === "success" ? (
            <SuccessBlock pdfUrl={state.pdfUrl} />
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-sm font-medium">
                  Seu melhor email
                </Label>
                <Input
                  id="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  required
                  placeholder="voce@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={state.kind === "loading"}
                  className="h-12 text-base"
                />
              </div>

              <label className="flex items-start gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={lgpd}
                  onChange={(e) => setLgpd(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-border accent-[var(--primary)]"
                />
                <span className="text-xs text-muted-foreground leading-relaxed">
                  Aceito receber o guia e comunicações ocasionais do Lumio.
                  Cancele a qualquer momento (LGPD).
                </span>
              </label>

              <Button
                type="submit"
                variant="gradient"
                size="lg"
                disabled={state.kind === "loading"}
                className="w-full"
              >
                {state.kind === "loading" ? (
                  "Enviando..."
                ) : (
                  <>
                    Baixar grátis <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>

              {state.kind === "error" ? (
                <p
                  role="alert"
                  className="text-xs text-destructive text-center leading-relaxed pt-1"
                >
                  {state.message}
                </p>
              ) : (
                <p className="text-[11px] text-muted-foreground text-center leading-relaxed pt-1">
                  PDF + 50 coins bônus se você criar conta com esse email.
                </p>
              )}
            </form>
          )}
        </div>

        {/* teaser bullets */}
        <div className="mt-12 grid gap-3 sm:gap-4">
          <p className="text-xs uppercase tracking-[0.15em] text-muted-foreground font-medium">
            O que tem dentro
          </p>
          {STEPS.map((s) => (
            <div
              key={s.n}
              className="flex gap-4 rounded-xl border border-border/50 bg-card/40 p-4"
            >
              <span className="text-primary font-bold text-lg shrink-0 w-7">{s.n}</span>
              <div>
                <p className="font-semibold text-foreground leading-snug">{s.title}</p>
                <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                  {s.body}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* trust signal — conservador */}
        <p className="mt-10 text-center text-xs text-muted-foreground">
          Material gratuito · Sem cadastro de cartão · Sem spam
        </p>
      </section>
    </main>
  );
}

function SuccessBlock({ pdfUrl }: { pdfUrl: string }) {
  return (
    <div className="text-center py-2">
      <div className="mx-auto h-12 w-12 rounded-full bg-emerald-500/10 flex items-center justify-center mb-4">
        <CheckCircle2 className="h-6 w-6 text-emerald-500" />
      </div>
      <h2 className="text-xl font-semibold">Pronto! Tá no seu email.</h2>
      <p className="mt-2 text-sm text-muted-foreground leading-relaxed max-w-sm mx-auto">
        Caso não apareça em 1 minuto, olha a aba de promoções. O download também
        começou em outra aba.
      </p>

      <div className="mt-6 flex flex-col gap-2.5">
        <Button asChild variant="gradient" size="lg" className="w-full">
          <a href={pdfUrl} target="_blank" rel="noopener noreferrer" download>
            <Download className="h-4 w-4" /> Baixar agora (PDF)
          </a>
        </Button>
        <Button asChild variant="outline" size="lg" className="w-full">
          <Link
            href="/signup?utm_source=lead_magnet&utm_medium=success_screen&utm_campaign=guia_revisao"
          >
            <Sparkles className="h-4 w-4" /> Resgatar +50 coins na conta
          </Link>
        </Button>
      </div>

      <p className="mt-5 text-[11px] text-muted-foreground inline-flex items-center gap-1.5">
        <FileText className="h-3 w-3" /> guia-revisao-prova.pdf · 4 páginas
      </p>
    </div>
  );
}
