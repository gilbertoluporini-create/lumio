"use client";

import {
  AlertTriangle,
  Edit3,
  FileText,
  Globe,
  Layers,
  Lightbulb,
  ListChecks,
  PlayCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { StudyContext } from "@/hooks/use-study-context";

/**
 * Catálogo "estático" de ações conhecidas. O id é o mesmo usado pelo handler
 * do /lumi (handleQuickAction em src/app/lumi/page.tsx) — não mexa nos ids
 * sem atualizar o handler.
 *
 * Os contextuais (continue-plan, exam-alert, resume-last-lecture) NÃO existem
 * aqui como ações finais — eles disparam ações conhecidas (summary, quiz, etc)
 * via payload extra. Veja buildQuickActions abaixo.
 */
export type QuickActionId =
  | "summary"
  | "flashcards"
  | "english"
  | "explain"
  | "quiz";

export type QuickAction = {
  id: QuickActionId;
  label: string;
  cost: number;
  description: string;
  Icon: typeof FileText;
  tone: string;
  /** Payload contextual opcional — usado pra pré-preencher diálogos de geração
   *  com a lecture/plano/matéria certos. Quando undefined, a ação é genérica. */
  payload?: QuickActionPayload;
  /** Marca que o chip foi inferido do contexto (vs catálogo fixo). UI usa pra
   *  destacar visualmente (badge sutil). */
  contextual?: boolean;
  /** Marca chip de urgência (prova próxima). UI usa tom de alerta. */
  urgent?: boolean;
};

export type QuickActionPayload = {
  lectureId?: string;
  lectureTitle?: string;
  planId?: string;
  planItemId?: string;
  subjectId?: string;
  subjectName?: string;
};

/* ---------------- Catálogo de ações genéricas (fallback) ---------------- */

const SUMMARY_GENERIC: QuickAction = {
  id: "summary",
  label: "Gerar resumo",
  cost: 8,
  description: "Resumo estruturado do contexto",
  Icon: FileText,
  tone: "text-violet-600 bg-violet-500/10",
};

const FLASHCARDS_GENERIC: QuickAction = {
  id: "flashcards",
  label: "Gerar flashcards",
  cost: 12,
  description: "Deck de revisão SRS",
  Icon: Layers,
  tone: "text-fuchsia-600 bg-fuchsia-500/10",
};

const ENGLISH_GENERIC: QuickAction = {
  id: "english",
  label: "Modo inglês médico",
  cost: 6,
  description: "Explicações em English",
  Icon: Globe,
  tone: "text-sky-600 bg-sky-500/10",
};

const EXPLAIN_GENERIC: QuickAction = {
  id: "explain",
  label: "Explicar conceito",
  cost: 4,
  description: "Quebrar um termo difícil",
  Icon: Lightbulb,
  tone: "text-amber-600 bg-amber-500/10",
};

const QUIZ_GENERIC: QuickAction = {
  id: "quiz",
  label: "Gerar quiz",
  cost: 10,
  description: "Questões de prática",
  Icon: Edit3,
  tone: "text-emerald-600 bg-emerald-500/10",
};

/** Catálogo plano — mantido como export pra retrocompat com qualquer
 *  consumidor que ainda usa a lista fixa (ex: import { QUICK_ACTIONS } no
 *  /lumi/page.tsx pra resolver chip → ação via .find()). */
export const QUICK_ACTIONS: QuickAction[] = [
  SUMMARY_GENERIC,
  FLASHCARDS_GENERIC,
  ENGLISH_GENERIC,
  EXPLAIN_GENERIC,
  QUIZ_GENERIC,
];

/* ---------------- Builder contextual ---------------- */

const MAX_CHIPS = 5;

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1).trimEnd()}…`;
}

/**
 * Constrói a lista final de chips a partir do contexto. Regras de priorização
 * (do mais relevante pro menos):
 *   1) Última aula (<24h) → "Resumir última aula: {title}"
 *   2) Plano ativo com próximo item → "Continuar plano: {nextItemTitle}"
 *   3) Prova em ≤7 dias → "Prova de {matéria} em Xd — gerar revisão" (urgente)
 *   4) Sempre: Explicar conceito (genérico)
 *   5) Sempre: Gerar flashcards (genérico)
 *
 * Mantém MAX_CHIPS no total. Se algum contextual não se aplica, desce os
 * genéricos pra preencher. Sem placeholder.
 */
export function buildQuickActions(
  context: StudyContext | null,
): QuickAction[] {
  const chips: QuickAction[] = [];

  if (context?.lastLecture) {
    const { id, title, subjectId, subjectName } = context.lastLecture;
    chips.push({
      ...SUMMARY_GENERIC,
      label: `Resumir: ${truncate(title, 28)}`,
      description: subjectName
        ? `Última aula • ${subjectName}`
        : "Última aula gravada",
      contextual: true,
      payload: {
        lectureId: id,
        lectureTitle: title,
        subjectId: subjectId ?? undefined,
        subjectName: subjectName ?? undefined,
      },
    });
  }

  if (context?.activePlan?.nextItemId && context.activePlan.nextItemTitle) {
    const plan = context.activePlan;
    // Mapeia kind do item pra QuickActionId conhecido. Items "document"/
    // "routine"/"note" caem em explain (não há ação direta — abre conversa).
    const kindToId: Record<string, QuickActionId> = {
      summary: "summary",
      flashcards: "flashcards",
      quiz: "quiz",
      mindmap: "summary", // mindmap não tem entry no enum local, route via summary handler
      routine: "explain",
      document: "explain",
      note: "explain",
    };
    const targetId: QuickActionId = plan.nextItemKind
      ? (kindToId[plan.nextItemKind] ?? "summary")
      : "summary";
    const base =
      targetId === "summary"
        ? SUMMARY_GENERIC
        : targetId === "flashcards"
          ? FLASHCARDS_GENERIC
          : targetId === "quiz"
            ? QUIZ_GENERIC
            : EXPLAIN_GENERIC;
    chips.push({
      ...base,
      id: targetId,
      label: `Continuar: ${truncate(plan.nextItemTitle ?? "", 26)}`,
      description: plan.title
        ? `Plano • ${truncate(plan.title, 28)}`
        : "Próximo passo do plano",
      Icon: PlayCircle,
      tone: "text-indigo-600 bg-indigo-500/10",
      contextual: true,
      payload: {
        planId: plan.id,
        planItemId: plan.nextItemId ?? undefined,
      },
    });
  }

  if (context?.nextExam && context.nextExam.daysUntil <= 7) {
    const exam = context.nextExam;
    const subjectBit = exam.subjectName ?? exam.title;
    chips.push({
      ...QUIZ_GENERIC,
      label: `Prova ${truncate(subjectBit, 18)} em ${exam.daysUntil}d`,
      description: "Gerar revisão urgente",
      Icon: AlertTriangle,
      tone: "text-red-600 bg-red-500/10",
      contextual: true,
      urgent: true,
      payload: {
        subjectId: exam.subjectId ?? undefined,
        subjectName: exam.subjectName ?? undefined,
      },
    });
  }

  // Genéricos garantidos
  chips.push({
    ...EXPLAIN_GENERIC,
    Icon: Lightbulb,
  });
  chips.push({
    ...FLASHCARDS_GENERIC,
    Icon: ListChecks,
  });

  // Dedup por (id + payload.lectureId|planItemId) preservando ordem
  const seen = new Set<string>();
  const deduped: QuickAction[] = [];
  for (const c of chips) {
    const key = `${c.id}::${c.payload?.lectureId ?? ""}::${c.payload?.planItemId ?? ""}::${c.urgent ? "urgent" : ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(c);
    if (deduped.length >= MAX_CHIPS) break;
  }
  return deduped;
}

/* ---------------- Componente ---------------- */

type Props = {
  onPick: (action: QuickAction) => void;
  disabled?: boolean;
  /** Contexto vindo do hook use-study-context. null = ainda carregando ou
   *  sem dados → cai no catálogo genérico. */
  context?: StudyContext | null;
};

export function LumiQuickActions({ onPick, disabled, context }: Props) {
  const actions = buildQuickActions(context ?? null);

  return (
    <div
      className={cn(
        // Mobile: scroll horizontal pra não quebrar layout quando muitos chips
        // contextuais entram. Desktop: grid como antes.
        "-mx-1 flex gap-3 overflow-x-auto px-1 pb-1 snap-x snap-mandatory",
        "md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:px-0 md:pb-0 md:snap-none lg:grid-cols-5",
      )}
      role="list"
      aria-label="Ações rápidas contextuais"
    >
      {actions.map((a, idx) => (
        <button
          key={`${a.id}-${idx}`}
          type="button"
          onClick={() => onPick(a)}
          disabled={disabled}
          role="listitem"
          aria-label={`${a.label} — ${a.description} · ${a.cost} coins`}
          className={cn(
            "group flex min-w-[200px] shrink-0 snap-start flex-col items-start gap-2 rounded-2xl border border-border/60 bg-card p-4 text-left transition-all md:min-w-0 md:shrink",
            "hover:border-primary/40 hover:-translate-y-0.5 hover:shadow-md hover:shadow-primary/5",
            "disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-none",
            a.urgent &&
              "border-red-500/40 ring-1 ring-red-500/10 hover:border-red-500/60",
            a.contextual &&
              !a.urgent &&
              "border-primary/30 ring-1 ring-primary/5",
          )}
        >
          <div
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-xl",
              a.tone,
            )}
          >
            <a.Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <div className="text-sm font-semibold leading-tight text-foreground">
                {a.label}
              </div>
              {a.contextual && !a.urgent && (
                <span
                  className="inline-block h-1.5 w-1.5 rounded-full bg-primary"
                  aria-hidden
                  title="Sugestão do seu contexto"
                />
              )}
            </div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">
              {a.description}
            </div>
          </div>
          <div
            className={cn(
              "mt-auto inline-flex items-center gap-1 text-[11px] font-medium",
              a.urgent ? "text-red-600" : "text-amber-600",
            )}
          >
            <span
              className={cn(
                "inline-block h-1.5 w-1.5 rounded-full",
                a.urgent ? "bg-red-500" : "bg-amber-500",
              )}
            />
            {a.cost} coins
          </div>
        </button>
      ))}
    </div>
  );
}
