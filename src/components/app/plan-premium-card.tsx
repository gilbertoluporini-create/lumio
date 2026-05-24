"use client";

import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Card de upsell pro Plano Premium — vai no rodapé da sidebar.
 * Quando a sidebar tá colapsada, vira só um ícone clicável que leva
 * pra /pricing.
 */
export function PlanPremiumCard({ collapsed }: { collapsed: boolean }) {
  if (collapsed) {
    return (
      <Link
        href="/account/billing"
        title="Plano Premium"
        className="flex h-10 w-10 mx-auto items-center justify-center rounded-lg bg-gradient-to-br from-primary/15 to-fuchsia-500/15 text-primary hover:from-primary/25 hover:to-fuchsia-500/25 transition-colors"
        aria-label="Plano Premium"
      >
        <Sparkles className="h-[18px] w-[18px]" />
      </Link>
    );
  }

  return (
    <Link
      href="/account/billing"
      className={cn(
        "group relative block rounded-xl border border-border/50 bg-gradient-to-br from-secondary/50 to-secondary/20 p-3 transition-all hover:border-primary/40 hover:from-primary/5 hover:to-fuchsia-500/5",
      )}
    >
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">
          <Sparkles className="h-[14px] w-[14px]" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold leading-tight">
            Plano Premium
          </div>
          <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
            Aproveite todos os recursos do Lumio.
          </p>
        </div>
        <ArrowRight className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
      </div>
    </Link>
  );
}
