"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, Suspense } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { LumioWordmark } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { PricingSection } from "@/components/landing/pricing-section";
import type { BillingInterval } from "@/lib/stripe";

type PaidPlan = "starter" | "pro" | "power" | "annual";

function PricingContent() {
  const router = useRouter();
  const params = useSearchParams();
  const [loading, setLoading] = useState<PaidPlan | null>(null);

  const initialInterval: BillingInterval =
    params.get("interval") === "annual" ? "annual" : "monthly";
  const [interval, setInterval] = useState<BillingInterval>(initialInterval);

  useEffect(() => {
    if (params.get("canceled") === "1") {
      toast.info("Checkout cancelado. Você pode tentar de novo quando quiser.");
    }
  }, [params]);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (interval === "annual") {
      url.searchParams.set("interval", "annual");
    } else {
      url.searchParams.delete("interval");
    }
    window.history.replaceState(null, "", url.toString());
  }, [interval]);

  async function checkout(plan: PaidPlan, chosenInterval: BillingInterval) {
    setLoading(plan);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ plan, interval: chosenInterval }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401) {
          toast.info("Faça login pra continuar com a assinatura.");
          router.push(
            `/login?next=/pricing?plan=${plan}&interval=${chosenInterval}`,
          );
          return;
        }
        toast.error(data?.error || "Falha ao iniciar checkout.");
        return;
      }
      if (data.url) window.location.href = data.url;
    } catch (err) {
      toast.error(`Erro: ${(err as Error).message}`);
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="relative min-h-screen overflow-x-hidden">
      <div className="pointer-events-none fixed inset-0 grid-bg opacity-40" />

      <header className="sticky top-0 z-30 backdrop-blur-xl bg-background/70 border-b border-border/40">
        <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3.5">
          <Link
            href="/"
            className="flex items-center gap-3 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Voltar</span>
          </Link>
          <Link href="/" className="flex items-center">
            <LumioWordmark />
          </Link>
          <div className="flex items-center gap-1.5">
            <ThemeToggle />
            <Button asChild variant="ghost" size="sm">
              <Link href="/login">Entrar</Link>
            </Button>
          </div>
        </nav>
      </header>

      <div
        onClickCapture={(e) => {
          const t = e.target as HTMLElement;
          const link = t.closest("a[href^='/checkout?plan=']");
          if (!link) return;
          e.preventDefault();
          const href = link.getAttribute("href") || "";
          const planMatch = href.match(/plan=(starter|pro|power|annual)/);
          const intervalMatch = href.match(/interval=(monthly|annual)/);
          const plan = (planMatch?.[1] ?? "pro") as PaidPlan;
          const chosenInterval = (intervalMatch?.[1] ?? interval) as BillingInterval;
          checkout(plan, chosenInterval);
        }}
      >
        <PricingSection interval={interval} onIntervalChange={setInterval} />
      </div>

      {loading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-5 py-4 shadow-xl">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span className="text-sm">Abrindo checkout seguro…</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default function PricingPage() {
  return (
    <Suspense fallback={null}>
      <PricingContent />
    </Suspense>
  );
}
