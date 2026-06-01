"use client";

/**
 * Badge "cai na prova" — pill âmbar mostrado em listagens (resumos, docs,
 * lecture header) quando o asset tem alta relevância pra uma prova próxima
 * (<7 dias). Dados vêm do hook `useExamRelevance`, que consome o endpoint
 * `/api/exam-relevance`. O cron `exam-relevance` é quem pré-calcula os
 * scores diariamente.
 */

import { Calendar } from "lucide-react";
import { cn } from "@/lib/utils";

export type ExamPrepBadgeProps = {
  examTitle: string;
  daysUntil: number;
  /** 0–1 (cosine similarity). Hoje só usado pra tooltip; visual é o mesmo. */
  relevanceScore: number;
  className?: string;
  /** Variante compacta sem o texto da matéria/prova — só "{n}d". */
  compact?: boolean;
};

function daysLabel(n: number): string {
  if (n <= 0) return "hoje";
  if (n === 1) return "amanhã";
  return `${n}d`;
}

export function ExamPrepBadge({
  examTitle,
  daysUntil,
  relevanceScore,
  className,
  compact = false,
}: ExamPrepBadgeProps) {
  const label = compact
    ? `Cai na prova · ${daysLabel(daysUntil)}`
    : `Cai na prova · ${daysLabel(daysUntil)}`;
  const tooltip = `Prova "${examTitle}" em ${daysLabel(daysUntil)} · relevância ${(relevanceScore * 100).toFixed(0)}%`;
  return (
    <span
      role="status"
      aria-label={tooltip}
      title={tooltip}
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-px text-[10px] font-medium",
        "bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30",
        className,
      )}
    >
      <Calendar className="h-3 w-3" aria-hidden />
      <span>{label}</span>
    </span>
  );
}
