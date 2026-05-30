"use client";

/**
 * /planos — Plano de Estudos (trilha guiada).
 *
 * Fase 2: lista planos reais + abre wizard de criação. Cada plano vira
 * card clicável que leva pra /planos/[id] (trilha + itens).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  Loader2,
  Sparkles,
  Target,
} from "lucide-react";
import { AuthGuard } from "@/components/app/auth-guard";
import { AppShell } from "@/components/app/app-shell";
import { Button } from "@/components/ui/button";
import { LumiCharacter } from "@/components/brand/lumi";
import { CreatePlanDialog } from "@/components/planos/create-plan-dialog";
import { listSubjectsAsync } from "@/lib/db";
import {
  daysUntilExam,
  listPlansAsync,
  type StudyPlan,
} from "@/lib/study-plans";
import type { Subject, User } from "@/lib/types";

function formatExamDate(iso: string | null): string | null {
  if (!iso) return null;
  try {
    return new Date(iso + "T00:00:00").toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function PlanCard({
  plan,
  subjectName,
}: {
  plan: StudyPlan;
  subjectName: string | null;
}) {
  const days = daysUntilExam(plan.examDate);
  const dateLabel = formatExamDate(plan.examDate);
  const countdownTone =
    days === null
      ? "text-muted-foreground"
      : days < 0
        ? "text-muted-foreground"
        : days <= 3
          ? "text-rose-500"
          : days <= 7
            ? "text-amber-500"
            : "text-primary";
  const countdownLabel =
    days === null
      ? "Sem data"
      : days < 0
        ? "Prova passada"
        : days === 0
          ? "Hoje"
          : days === 1
            ? "Amanhã"
            : `${days} dias`;

  return (
    <Link
      href={`/planos/${plan.id}`}
      className="group flex flex-col gap-3 rounded-2xl border border-border/60 bg-card p-4 transition-all hover:border-primary/40 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <Target className="h-3 w-3 text-primary" />
            {subjectName ?? "Geral"}
          </div>
          <h3 className="mt-1 line-clamp-2 text-sm font-semibold leading-snug text-foreground">
            {plan.title}
          </h3>
        </div>
        <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
      </div>

      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <span
          className={`inline-flex items-center gap-1 rounded-full border border-border/60 bg-background/60 px-2 py-0.5 ${countdownTone}`}
        >
          <CalendarDays className="h-3 w-3" />
          {countdownLabel}
        </span>
        {dateLabel ? (
          <span className="text-muted-foreground">· {dateLabel}</span>
        ) : null}
      </div>
    </Link>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="rounded-2xl border border-dashed border-border/60 bg-card/50 p-8 md:p-12">
      <div className="mx-auto flex max-w-md flex-col items-center text-center">
        <LumiCharacter size="md" mood="waving" float />
        <h2 className="mt-4 text-lg font-semibold">
          Nenhum plano de estudos ainda
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Crie o primeiro plano e monte sua trilha passo a passo: documentos,
          resumos, mapas mentais, quiz, flashcards e cronograma — tudo na ordem
          que faz sentido pra você.
        </p>

        <div className="mt-6 grid w-full gap-2 text-left">
          <Step
            n={1}
            title="Crie um plano por prova/matéria"
            hint="Nome + data da prova"
          />
          <Step
            n={2}
            title="Adicione itens à trilha"
            hint="Documentos, resumos, quiz, flashcards…"
          />
          <Step
            n={3}
            title="Avance item a item"
            hint="Vê % de progresso até a prova"
          />
        </div>

        <Button onClick={onCreate} className="mt-6 gap-1.5">
          <Target className="h-4 w-4" />
          Criar meu primeiro plano
        </Button>
      </div>
    </div>
  );
}

function Step({ n, title, hint }: { n: number; title: string; hint: string }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-border/40 bg-background/60 p-3">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
        {n}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
    </div>
  );
}

function PlanosView({ user }: { user: User }) {
  const [plans, setPlans] = useState<StudyPlan[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    const [p, s] = await Promise.all([
      listPlansAsync(user.id),
      listSubjectsAsync(user.id),
    ]);
    setPlans(p);
    setSubjects(s);
    setLoading(false);
  }, [user.id]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const subjectById = useMemo(() => {
    const m = new Map<string, string>();
    subjects.forEach((s) => m.set(s.id, s.name));
    return m;
  }, [subjects]);

  return (
    // Flow natural: cabe → sem scroll; passa → body scrolla.
    // Em desktop reduzimos padding vertical e o mb do header pra que o caso
    // comum (0-9 cards em 3 colunas) caiba sem forçar scroll.
    <div className="mx-auto w-full max-w-[1100px] px-4 py-6 lg:px-8 lg:py-5">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between lg:mb-5">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-primary">
            <Sparkles className="h-3 w-3" />
            Beta
          </div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
            Plano de Estudos
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Crie trilhas passo a passo até sua prova — documentos, resumos,
            mapas, quiz e cronograma na ordem certa.
          </p>
        </div>
        <Button
          onClick={() => setDialogOpen(true)}
          className="gap-1.5"
          size="lg"
        >
          <Target className="h-4 w-4" />
          Criar plano
        </Button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Carregando seus planos…
        </div>
      ) : plans.length === 0 ? (
        <EmptyState onCreate={() => setDialogOpen(true)} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {plans.map((p) => (
            <PlanCard
              key={p.id}
              plan={p}
              subjectName={p.subjectId ? subjectById.get(p.subjectId) ?? null : null}
            />
          ))}
        </div>
      )}

      <CreatePlanDialog
        userId={user.id}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreated={() => void reload()}
      />
    </div>
  );
}

export default function PlanosPage() {
  return (
    <AuthGuard>
      {(user) => (
        <AppShell user={user}>
          <PlanosView user={user} />
        </AppShell>
      )}
    </AuthGuard>
  );
}
