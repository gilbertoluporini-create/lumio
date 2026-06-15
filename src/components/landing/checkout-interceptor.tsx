"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Analytics } from "@/lib/analytics";
import type { BillingInterval } from "@/lib/stripe";

type PaidPlan = "starter" | "pro" | "power" | "annual";

/**
 * Intercepta cliques nos links de plano (`a[href^='/checkout?plan=']`) que o
 * PricingSection renderiza e dispara o checkout via POST /api/checkout, sem
 * navegar pra `/checkout` — que não existe como página (só `/api/checkout`).
 *
 * O PricingSection é usado na landing (`/`) e em `/pricing`. A página /pricing
 * já tem o próprio interceptador; este componente leva o mesmo comportamento
 * pra landing, onde o clique antes caía num 404. Deslogado → manda pro /login
 * com `next` de volta pra /pricing com o plano escolhido.
 */
export function CheckoutInterceptor({
  fallbackInterval = "monthly",
  children,
}: {
  fallbackInterval?: BillingInterval;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState<PaidPlan | null>(null);

  async function checkout(plan: PaidPlan, chosenInterval: BillingInterval) {
    setLoading(plan);
    try {
      // Tracking ANTES do fetch (intent registrado mesmo se a chamada falhar)
      const priceMap: Record<PaidPlan, { monthly: number; annual: number }> = {
        starter: { monthly: 39, annual: 390 },
        pro: { monthly: 69, annual: 690 },
        power: { monthly: 119, annual: 1190 },
        annual: { monthly: 690, annual: 690 },
      };
      const value = priceMap[plan]?.[chosenInterval] ?? 0;
      Analytics.beginCheckout(`${plan}_${chosenInterval}`, value, "BRL");

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
    <>
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
          const chosenInterval = (intervalMatch?.[1] ??
            fallbackInterval) as BillingInterval;
          checkout(plan, chosenInterval);
        }}
      >
        {children}
      </div>
      {loading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-5 py-4 shadow-xl">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span className="text-sm">Abrindo checkout seguro…</span>
          </div>
        </div>
      )}
    </>
  );
}
