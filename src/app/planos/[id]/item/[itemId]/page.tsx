"use client";

/**
 * /planos/[id]/item/[itemId] — Tela "trilha" do item do plano.
 *
 * Mostra o asset gerado dentro do contexto do plano (item N de M, dias pra
 * prova, nav anterior/próximo) em vez de jogar o user direto na rota genérica
 * do asset. Pra summary renderiza markdown inline. Pros outros kinds mostra
 * card "Abrir" → rota original. Lida com status pending (poll) e failed (retry).
 *
 * Seção "Outros assets desse material" lista os 3 demais kinds que o user
 * pode gerar a partir da mesma fonte (mesmo source_document_id OU
 * source_lecture_id). Click cria item novo no plano + trigger worker.
 */

import { use, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  FileText,
  Layers,
  Loader2,
  Network,
  Plus,
  RefreshCw,
  Sparkles,
  Target,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";

import { AuthGuard } from "@/components/app/auth-guard";
import { AppShell } from "@/components/app/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  addItemAsync,
  assetHrefFor,
  daysUntilExam,
  getPlanAsync,
  ITEM_KIND_LABEL,
  type StudyPlan,
  type StudyPlanItem,
  type StudyPlanItemKind,
} from "@/lib/study-plans";
import { getSummaryAsync } from "@/lib/summaries";
import { COIN_COSTS } from "@/lib/coin-costs";
import { cn } from "@/lib/utils";
import type { Summary, User } from "@/lib/types";

const KIND_ICON: Record<StudyPlanItemKind, typeof FileText> = {
  document: FileText,
  summary: FileText,
  mindmap: Network,
  quiz: Sparkles,
  flashcards: Layers,
  routine: CalendarDays,
  note: FileText,
};

/** Kinds que podemos gerar a partir de uma source (doc OU lecture). */
const GENERABLE_FROM_SOURCE: StudyPlanItemKind[] = [
  "summary",
  "flashcards",
  "quiz",
  "mindmap",
];

const KIND_COST: Record<StudyPlanItemKind, number | null> = {
  summary: COIN_COSTS.summary,
  flashcards: COIN_COSTS.flashcards,
  quiz: COIN_COSTS.quiz,
  mindmap: COIN_COSTS.mindmap,
  document: null,
  routine: COIN_COSTS.routine,
  note: null,
};

export default function PlanItemPage({
  params,
}: {
  params: Promise<{ id: string; itemId: string }>;
}) {
  const { id, itemId } = use(params);
  return (
    <AuthGuard>
      {(user) => (
        <AppShell user={user}>
          <PlanItemView user={user} planId={id} itemId={itemId} />
        </AppShell>
      )}
    </AuthGuard>
  );
}

function PlanItemView({
  user,
  planId,
  itemId,
}: {
  user: User;
  planId: string;
  itemId: string;
}) {
  const router = useRouter();
  const [plan, setPlan] = useState<StudyPlan | null>(null);
  const [items, setItems] = useState<StudyPlanItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [summary, setSummary] = useState<Summary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  const reload = useCallback(async () => {
    const result = await getPlanAsync(user.id, planId);
    if (!result) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    setPlan(result.plan);
    setItems(result.items);
    setLoading(false);
  }, [user.id, planId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const currentItem = useMemo(
    () => items.find((i) => i.id === itemId) ?? null,
    [items, itemId],
  );

  const currentIndex = useMemo(
    () => items.findIndex((i) => i.id === itemId),
    [items, itemId],
  );

  const previousItem = currentIndex > 0 ? items[currentIndex - 1] : null;
  const nextItem =
    currentIndex >= 0 && currentIndex < items.length - 1
      ? items[currentIndex + 1]
      : null;

  // Carrega summary (só pra kind=summary com assetId pronto)
  useEffect(() => {
    if (!currentItem) return;
    if (currentItem.kind !== "summary" || !currentItem.assetId) {
      setSummary(null);
      return;
    }
    setSummaryLoading(true);
    void getSummaryAsync(user.id, currentItem.assetId)
      .then((s) => setSummary(s))
      .finally(() => setSummaryLoading(false));
  }, [user.id, currentItem?.kind, currentItem?.assetId, currentItem]);

  // Redirect pra /lecture/[id]?tab=summary quando o item é summary com aula
  // vinculada. A tela /lecture é o ESQUELETO CANÔNICO de resumo (tabs de
  // transcrição revisada/crua/resumo, imagens, TTS, etc).
  useEffect(() => {
    if (!currentItem) return;
    if (currentItem.kind !== "summary" || currentItem.status !== "done") return;
    const primaryLectureId =
      currentItem.sourceLectureIds?.[0] ?? currentItem.sourceLectureId ?? null;
    if (primaryLectureId) {
      router.replace(`/lecture/${primaryLectureId}?tab=summary`);
    }
  }, [currentItem, router]);

  // Poll enquanto pending — worker pode demorar uns segundos
  useEffect(() => {
    if (!currentItem || currentItem.status !== "pending") return;
    let alive = true;
    const trigger = () => {
      if (!alive) return;
      // Dispara worker (idempotente, conta Hobby sem cron sub-diário)
      fetch("/api/cron/study-plan-generator", { method: "POST" }).catch(
        () => {},
      );
      void reload();
    };
    trigger();
    const t = setInterval(trigger, 8_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [currentItem?.status, currentItem?.id, reload, currentItem]);

  // Trigger manual quando user clica em "Tentar de novo" num item failed
  const handleRetry = useCallback(async () => {
    if (!currentItem) return;
    // Volta status pra pending; worker pega na próxima passada
    try {
      const supabase = (
        await import("@/lib/supabase/client")
      ).createClient();
      const { error } = await supabase
        .from("study_plan_items")
        .update({ status: "pending", error_message: null })
        .eq("id", currentItem.id);
      if (error) throw error;
      await fetch("/api/cron/study-plan-generator", { method: "POST" }).catch(
        () => {},
      );
      toast.success("Voltando pra fila — gerando de novo.");
      void reload();
    } catch (err) {
      toast.error(
        `Falha ao tentar de novo: ${(err as Error).message ?? "erro desconhecido"}`,
      );
    }
  }, [currentItem, reload]);

  // Adiciona novo item ao plano (mesma source, kind diferente) e dispara worker
  const handleAddKind = useCallback(
    async (kind: StudyPlanItemKind) => {
      if (!currentItem) return;
      try {
        const sourceTitle = currentItem.title;
        const created = await addItemAsync({
          planId,
          kind,
          title: `${ITEM_KIND_LABEL[kind]} — ${sourceTitle}`,
        });
        if (!created) {
          toast.error("Não consegui adicionar o item.");
          return;
        }
        // Linka source (document_id ou lecture_id) — addItemAsync hoje não
        // aceita esses campos, então faço update direto.
        const supabase = (
          await import("@/lib/supabase/client")
        ).createClient();
        const patch: Record<string, unknown> = {};
        if (currentItem.sourceDocumentId)
          patch.source_document_id = currentItem.sourceDocumentId;
        if (currentItem.sourceLectureId)
          patch.source_lecture_id = currentItem.sourceLectureId;
        if (Object.keys(patch).length > 0) {
          await supabase
            .from("study_plan_items")
            .update(patch)
            .eq("id", created.id);
        }
        await fetch("/api/cron/study-plan-generator", { method: "POST" }).catch(
          () => {},
        );
        toast.success(`${ITEM_KIND_LABEL[kind]} entrou na trilha — gerando.`);
        router.push(`/planos/${planId}/item/${created.id}`);
      } catch (err) {
        toast.error(
          `Falha ao adicionar: ${(err as Error).message ?? "erro desconhecido"}`,
        );
      }
    },
    [currentItem, planId, router],
  );

  // Items do plano que compartilham source com o item atual
  const sameSourceItems = useMemo(() => {
    if (!currentItem) return [];
    return items.filter(
      (i) =>
        i.id !== currentItem.id &&
        ((currentItem.sourceDocumentId &&
          i.sourceDocumentId === currentItem.sourceDocumentId) ||
          (currentItem.sourceLectureId &&
            i.sourceLectureId === currentItem.sourceLectureId)),
    );
  }, [items, currentItem]);

  // Quais dos 4 kinds principais ainda não existem nesse material
  const missingKinds = useMemo<StudyPlanItemKind[]>(() => {
    if (!currentItem) return [];
    const present = new Set<StudyPlanItemKind>([currentItem.kind]);
    for (const s of sameSourceItems) present.add(s.kind);
    return GENERABLE_FROM_SOURCE.filter((k) => !present.has(k));
  }, [currentItem, sameSourceItems]);

  const examDays = useMemo(
    () => (plan ? daysUntilExam(plan.examDate) : null),
    [plan],
  );

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (notFound || !plan || !currentItem) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 py-12 text-center">
        <p className="text-muted-foreground">
          Item não encontrado nesse plano.
        </p>
        <Button asChild variant="outline">
          <Link href={`/planos/${planId}`}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar pro plano
          </Link>
        </Button>
      </div>
    );
  }

  const KindIcon = KIND_ICON[currentItem.kind];
  const externalHref = assetHrefFor(currentItem);

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 md:px-8">
      {/* Breadcrumb / back */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Button
          asChild
          size="sm"
          variant="ghost"
          className="-ml-2 gap-1.5 text-muted-foreground"
        >
          <Link href={`/planos/${planId}`}>
            <ArrowLeft className="h-4 w-4" />
            {plan.title}
          </Link>
        </Button>
        <span>·</span>
        <span>
          Item {currentIndex + 1} de {items.length}
        </span>
        {examDays !== null && examDays >= 0 && (
          <>
            <span>·</span>
            <span className="flex items-center gap-1">
              <Target className="h-3.5 w-3.5" />
              {examDays === 0 ? "Prova hoje" : `${examDays} dias pra prova`}
            </span>
          </>
        )}
      </div>

      {/* Header do item */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="gap-1.5">
            <KindIcon className="h-3.5 w-3.5" />
            {ITEM_KIND_LABEL[currentItem.kind]}
          </Badge>
          {currentItem.status === "pending" && (
            <Badge
              variant="outline"
              className="gap-1.5 border-amber-500/40 text-amber-600"
            >
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Gerando
            </Badge>
          )}
          {currentItem.status === "failed" && (
            <Badge
              variant="outline"
              className="border-destructive/40 text-destructive"
            >
              Falhou
            </Badge>
          )}
          {currentItem.status === "done" && (
            <Badge
              variant="outline"
              className="border-emerald-500/40 text-emerald-600"
            >
              Pronto
            </Badge>
          )}
        </div>
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
          {currentItem.title}
        </h1>
        {currentItem.description && (
          <p className="text-muted-foreground">{currentItem.description}</p>
        )}
      </div>

      {/* Conteúdo principal */}
      <div className="rounded-lg border bg-card p-6 md:p-8">
        {currentItem.status === "pending" && (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm font-medium">
              {ITEM_KIND_LABEL[currentItem.kind]} sendo gerado pela Lumi
            </p>
            <p className="max-w-md text-xs text-muted-foreground">
              Isso pode levar de alguns segundos até uns minutos dependendo do
              tamanho do material. A página recarrega sozinha quando ficar
              pronto.
            </p>
          </div>
        )}

        {currentItem.status === "failed" && (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <div className="text-3xl">❌</div>
            <p className="text-sm font-medium">
              Não consegui gerar esse {ITEM_KIND_LABEL[currentItem.kind].toLowerCase()}
              .
            </p>
            {currentItem.errorMessage && (
              <p className="max-w-md text-xs text-muted-foreground">
                {currentItem.errorMessage}
              </p>
            )}
            <Button size="sm" onClick={handleRetry} className="mt-2 gap-2">
              <RefreshCw className="h-4 w-4" />
              Tentar de novo
            </Button>
          </div>
        )}

        {currentItem.status === "done" && currentItem.kind === "summary" && (
          <>
            {summaryLoading && (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            )}
            {!summaryLoading && summary && (
              <article className="prose prose-neutral dark:prose-invert max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {summary.content.generalSummary}
                </ReactMarkdown>
              </article>
            )}
            {!summaryLoading && !summary && (
              <p className="py-12 text-center text-sm text-muted-foreground">
                Resumo não encontrado. Pode ter sido deletado.
              </p>
            )}
          </>
        )}

        {currentItem.status === "done" &&
          currentItem.kind !== "summary" &&
          externalHref && (
            <div className="flex flex-col items-center gap-4 py-8 text-center">
              <div
                className={cn(
                  "flex h-16 w-16 items-center justify-center rounded-full",
                  "bg-primary/10 text-primary",
                )}
              >
                <KindIcon className="h-7 w-7" />
              </div>
              <p className="text-sm font-medium">
                {ITEM_KIND_LABEL[currentItem.kind]} pronto pra abrir
              </p>
              <Button asChild size="lg" className="gap-2">
                <Link href={externalHref}>
                  Abrir {ITEM_KIND_LABEL[currentItem.kind].toLowerCase()}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          )}

        {currentItem.status === "done" &&
          currentItem.kind !== "summary" &&
          !externalHref && (
            <p className="py-12 text-center text-sm text-muted-foreground">
              Asset ainda sem link configurado.
            </p>
          )}
      </div>

      {/* Outros assets desse material */}
      {(missingKinds.length > 0 || sameSourceItems.length > 0) && (
        <div className="rounded-lg border bg-card p-6">
          <h2 className="text-sm font-semibold">
            Outros assets desse material
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Gere mais formatos a partir da mesma fonte sem precisar re-subir
            nada.
          </p>

          {sameSourceItems.length > 0 && (
            <div className="mt-4 space-y-2">
              <p className="text-xs font-medium text-muted-foreground">
                Já na trilha
              </p>
              <div className="flex flex-wrap gap-2">
                {sameSourceItems.map((s) => {
                  const Icon = KIND_ICON[s.kind];
                  return (
                    <Button
                      key={s.id}
                      asChild
                      size="sm"
                      variant="outline"
                      className="gap-2"
                    >
                      <Link href={`/planos/${planId}/item/${s.id}`}>
                        <Icon className="h-3.5 w-3.5" />
                        {ITEM_KIND_LABEL[s.kind]}
                        {s.status === "pending" && (
                          <Loader2 className="h-3 w-3 animate-spin opacity-60" />
                        )}
                      </Link>
                    </Button>
                  );
                })}
              </div>
            </div>
          )}

          {missingKinds.length > 0 && (
            <div className="mt-4 space-y-2">
              <p className="text-xs font-medium text-muted-foreground">
                Adicionar à trilha
              </p>
              <div className="flex flex-wrap gap-2">
                {missingKinds.map((k) => {
                  const Icon = KIND_ICON[k];
                  const cost = KIND_COST[k];
                  return (
                    <Button
                      key={k}
                      size="sm"
                      variant="outline"
                      className="gap-2"
                      onClick={() => void handleAddKind(k)}
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <Icon className="h-3.5 w-3.5" />
                      {ITEM_KIND_LABEL[k]}
                      {cost !== null && (
                        <span className="text-muted-foreground">~{cost}c</span>
                      )}
                    </Button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Nav anterior/próximo */}
      <div className="flex items-center justify-between gap-2 pt-2">
        {previousItem ? (
          <Button asChild variant="outline" size="sm" className="gap-2">
            <Link href={`/planos/${planId}/item/${previousItem.id}`}>
              <ChevronLeft className="h-4 w-4" />
              <span className="hidden sm:inline">{previousItem.title}</span>
              <span className="sm:hidden">Anterior</span>
            </Link>
          </Button>
        ) : (
          <span />
        )}
        {nextItem ? (
          <Button asChild variant="outline" size="sm" className="gap-2">
            <Link href={`/planos/${planId}/item/${nextItem.id}`}>
              <span className="hidden sm:inline">{nextItem.title}</span>
              <span className="sm:hidden">Próximo</span>
              <ChevronRight className="h-4 w-4" />
            </Link>
          </Button>
        ) : (
          <span />
        )}
      </div>
    </div>
  );
}
