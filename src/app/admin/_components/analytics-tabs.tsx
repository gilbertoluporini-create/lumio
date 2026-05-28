"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, BarChart3, Coins, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/admin/marketing", label: "Vendas & Funil", Icon: TrendingUp },
  { href: "/admin/metrics", label: "Métricas", Icon: BarChart3 },
  { href: "/admin/usage", label: "Uso & Margem", Icon: Coins },
  { href: "/admin/realtime", label: "Tempo real", Icon: Activity },
];

/**
 * Barra de abas compartilhada das telas de Analytics. Renderizada no topo de
 * /admin/marketing, /admin/metrics, /admin/usage e /admin/realtime — dá a
 * sensação de "uma tela só com 4 abas" sem mover páginas nem mudar URLs.
 */
export function AnalyticsTabs() {
  const pathname = usePathname();
  return (
    <div className="mb-6 flex items-center gap-1 border-b border-neutral-800 overflow-x-auto">
      {TABS.map((tab) => {
        const active = pathname?.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap",
              active
                ? "border-fuchsia-500 text-fuchsia-300"
                : "border-transparent text-neutral-400 hover:text-neutral-200",
            )}
          >
            <tab.Icon className="h-3.5 w-3.5" />
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
