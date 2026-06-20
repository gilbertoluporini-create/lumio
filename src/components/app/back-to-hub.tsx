"use client";

/**
 * BackToHub — botão "voltar" que aponta pra tela da ABA do menu lateral
 * correspondente ao tipo de asset que o user está vendo.
 *
 * Exemplos:
 *   /resumo/[id]           → /resumos
 *   /lecture/[id]          → /gravacoes
 *   /deck/[id]             → /flashcards
 *   /quiz-banco/[id]       → /quiz
 *   /mapa/[id]             → /planos (mapa mental vive dentro do plano)
 *   /document/[id]         → /documentos
 *   /subject/[id]          → /documentos
 *   /planos/[id]           → /planos
 *   /help/tickets/[id]     → /help
 *
 * Quem chamar pode override via prop `to` + `label`.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

type HubMap = {
  test: (path: string) => boolean;
  to: string;
  label: string;
};

const HUB_MAP: HubMap[] = [
  { test: (p) => p.startsWith("/resumo/doc/"), to: "/resumos", label: "Resumos" },
  { test: (p) => p.startsWith("/resumo/"), to: "/resumos", label: "Resumos" },
  { test: (p) => p.startsWith("/resumos"), to: "/resumos", label: "Resumos" },
  { test: (p) => p.startsWith("/lecture/"), to: "/gravacoes", label: "Gravações" },
  { test: (p) => p.startsWith("/deck/"), to: "/flashcards", label: "Flashcards" },
  { test: (p) => p.startsWith("/quiz-banco/"), to: "/quiz", label: "Quiz" },
  { test: (p) => p.startsWith("/mapa/"), to: "/planos", label: "Plano de Estudos" },
  { test: (p) => p.startsWith("/planos/"), to: "/planos", label: "Plano de Estudos" },
  { test: (p) => p.startsWith("/document/"), to: "/documentos", label: "Minhas matérias" },
  { test: (p) => p.startsWith("/subject/"), to: "/documentos", label: "Minhas matérias" },
  { test: (p) => p.startsWith("/help/tickets/"), to: "/help", label: "Ajuda" },
  { test: (p) => p.startsWith("/help/"), to: "/help", label: "Ajuda" },
  { test: (p) => p.startsWith("/admin/"), to: "/admin", label: "Admin" },
];

function inferHub(pathname: string): { to: string; label: string } {
  for (const m of HUB_MAP) {
    if (m.test(pathname)) return { to: m.to, label: m.label };
  }
  return { to: "/dashboard", label: "Dashboard" };
}

export function BackToHub({
  to,
  label,
  className,
  size = "default",
}: {
  /** Override do destino (caso queira algo diferente do inferido pelo path). */
  to?: string;
  /** Override do label (default usa nome da aba). */
  label?: string;
  className?: string;
  size?: "default" | "sm";
}) {
  const pathname = usePathname() ?? "";
  const inferred = inferHub(pathname);
  const href = to ?? inferred.to;
  const text = label ?? inferred.label;

  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors",
        size === "sm" ? "text-xs" : "text-sm",
        className,
      )}
      aria-label={`Voltar para ${text}`}
    >
      <ArrowLeft className={size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"} />
      <span>{text}</span>
    </Link>
  );
}
