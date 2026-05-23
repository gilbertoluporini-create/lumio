"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, Suspense } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { LumioWordmark } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { PricingSection } from "@/components/landing/pricing-section";
import { Magnetic } from "@/components/landing/magnetic";

function PricingContent() {
  const router = useRouter();
  const params = useSearchParams();
  const [loading, setLoading] = useState<"starter" | "pro" | "power" | "annual" | null>(null);

  if (params.get("canceled") === "1") {
    toast.info("Checkout cancelado. Você pode tentar de novo quando quiser.");
  }

  async function checkout(plan: "starter" | "pro" | "power" | "annual") {
    setLoading(plan);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401) {
          toast.info("Faça login pra continuar com a assinatura.");
          router.push(`/login?next=/pricing?plan=${plan}`);
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

  // Hooka os botões da PricingSection sobrescrevendo via event delegation
  // (PricingSection usa <Link>, então interceptamos)
  return (
    <div className="relative min-h-screen overflow-x-hidden">
      <div className="pointer-events-none fixed inset-0 grid-bg opacity-40" />

      <header className="sticky top-0 z-30 backdrop-blur-xl bg-background/70 border-b border-border/40">
        <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3.5">
          <Link href="/" className="flex items-center gap-3 text-sm text-muted-foreground hover:text-foreground transition-colors">
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
          const m = href.match(/plan=(starter|pro|power|annual)/);
          const plan = (m?.[1] ?? "pro") as "starter" | "pro" | "power" | "annual";
          checkout(plan);
        }}
      >
        <PricingSection />
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
