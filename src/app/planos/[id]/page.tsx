"use client";

/**
 * /planos/[id] — Trilha do plano de estudo.
 *
 * Lista os itens ordenados, com checkbox pra marcar concluído, barra de
 * progresso no topo e botão "Adicionar item". Asset linking (puxar resumo
 * existente, mapa, etc.) entra na Fase 3 com o Lumi orquestrando.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  Circle,
  ExternalLink,
  FileText,
  Layers,
  Loader2,
  MoreVertical,
  Network,
  Notebook,
  Plus,
  Route,
  Sparkles,
  Target,
  Trash2,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";
import { AuthGuard } from "@/components/app/auth-guard";
import { AppShell } from "@/components/app/app-shell";
import { BackToHub } from "@/components/app/back-to-hub";
import { Button } from "@/components/ui/button";
import { confirmAction } from "@/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { listSubjectsAsync } from "@/lib/db";
import { createDocumentAsync } from "@/lib/documents";
import { createClient as createSupabaseClient } from "@/lib/supabase/client";
import {
  addItemAsync,
  assetHrefFor,
  daysUntilExam,
  deleteItemAsync,
  deletePlanAsync,
  GENERATABLE_KINDS,
  WIZARD_KINDS,
  getPlanAsync,
  ITEM_KIND_LABEL,
  progressPercent,
  updateItemAsync,
  updateItemStatusAsync,
  type StudyPlan,
  type StudyPlanItem,
  type StudyPlanItemKind,
} from "@/lib/study-plans";
import { cn } from "@/lib/utils";
import type { User } from "@/lib/types";
import { ContentWizard } from "@/components/ai/content-wizard";
import {
  RotinaWizardDialog,
  type RotinaWizardSubmit,
} from "@/components/planos/rotina-wizard-dialog";
import type { AIMode } from "@/lib/coins-pricing";

const KIND_ICON: Record<StudyPlanItemKind, typeof FileText> = {
  document: FileText,
  summary: FileText,
  mindmap: Network,
  quiz: Sparkles,
  flashcards: Layers,
  routine: CalendarDays,
  note: Notebook,
};

const KIND_TONE: Record<StudyPlanItemKind, string> = {
  document: "bg-sky-500/10 text-sky-600 border-sky-500/20",
  summary: "bg-violet-500/10 text-violet-600 border-violet-500/20",
  mindmap: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  quiz: "bg-fuchsia-500/10 text-fuchsia-600 border-fuchsia-500/20",
  flashcards: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  routine: "bg-primary/10 text-primary border-primary/20",
  note: "bg-muted text-muted-foreground border-border",
};

function formatExamDate(iso: string | null): string | null {
  if (!iso) return null;
  try {
    return new Date(iso + "T00:00:00").toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

/**
 * Tempo médio estimado por kind, em ms. O worker é binário (envia LLM call,
 * espera resposta), não tem progresso real, então a barra é uma ESTIMATIVA
 * visual de quanto tempo já passou desde que o worker pegou o item. Quando
 * passa do ETA, a barra trava em 95% pra não dar a falsa impressão de
 * "terminou" antes do worker realmente confirmar via reload.
 *
 * Calibrado em runs reais (ai_usage_log): summary com ~4k output tokens em
 * Sonnet 4.5 → ~50s só de geração + latência + save + busca de material
 * complementar = ~75-90s totais. Flashcards/quiz/mindmap com payload JSON
 * menor saem mais rápido.
 */
const KIND_ETA_MS: Record<string, number> = {
  summary: 90_000,
  flashcards: 50_000,
  quiz: 50_000,
  mindmap: 40_000,
};

function PlanoView({ user }: { user: User }) {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const planId = params.id;

  const [plan, setPlan] = useState<StudyPlan | null>(null);
  const [items, setItems] = useState<StudyPlanItem[]>([]);
  const [subjectName, setSubjectName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  /** Item da trilha selecionado pra "Gerar agora" — abre o ContentWizard. */
  const [genItem, setGenItem] = useState<StudyPlanItem | null>(null);
  /**
   * Timestamps de quando cada item virou `generating` (capturado no client
   * porque o tipo não traz updated_at). Usado pra calcular a barra de
   * progresso estimada. Map persiste durante a sessão; itens que saem de
   * generating são removidos.
   */
  const generatingStartRef = useRef<Map<string, number>>(new Map());
  /** Tick global pra rerender a barra a cada 1s enquanto há generating. */
  const [progressTick, setProgressTick] = useState(0);
  /** Item de Rotina selecionado pra abrir RotinaWizardDialog. */
  const [rotinaItem, setRotinaItem] = useState<StudyPlanItem | null>(null);

  // `reload` é chamado no mount E pelo polling de 10s enquanto há items
  // pending. Não mexe em `loading` aqui — o estado de carregamento inicial
  // é controlado só pelo `loading=true` inicial do useState. Antes,
  // `setLoading(true)` a cada poll fazia a tela INTEIRA virar
  // "Carregando…" a cada 5s, gerando flicker absurdo durante a geração.
  const reload = useCallback(async () => {
    const result = await getPlanAsync(user.id, planId);
    if (!result) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    setPlan(result.plan);
    setItems(result.items);
    if (result.plan.subjectId) {
      const subjects = await listSubjectsAsync(user.id);
      const s = subjects.find((x) => x.id === result.plan.subjectId);
      setSubjectName(s?.name ?? null);
    }
    setLoading(false);
  }, [user.id, planId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Polling enquanto há items em geração assíncrona (pending/generating).
  // Cron worker processa 1 item por minuto em prod, mas localmente queremos
  // ver assets aparecendo "ao vivo" assim que ficam prontos. 5s de intervalo.
  const hasInflight = useMemo(
    () =>
      items.some((i) => i.status === "pending" || i.status === "generating"),
    [items],
  );

  useEffect(() => {
    if (!hasInflight) return;
    const t = setInterval(() => {
      void reload();
    }, 5000);
    return () => clearInterval(t);
  }, [hasInflight, reload]);

  // Mantém o Map de "quando cada item virou generating" sincronizado com
  // o estado atual. Quando um item entra em generating, registra agora;
  // quando sai, remove. Essa ref alimenta a barra de progresso por item.
  useEffect(() => {
    const map = generatingStartRef.current;
    const seen = new Set<string>();
    for (const i of items) {
      if (i.status === "generating") {
        seen.add(i.id);
        if (!map.has(i.id)) map.set(i.id, Date.now());
      }
    }
    for (const id of Array.from(map.keys())) {
      if (!seen.has(id)) map.delete(id);
    }
  }, [items]);

  // Tick de 1s pra avançar visualmente a barra de progresso. Só roda se
  // há pelo menos um item generating — fica idle caso contrário.
  const anyGenerating = useMemo(
    () => items.some((i) => i.status === "generating"),
    [items],
  );
  useEffect(() => {
    if (!anyGenerating) return;
    const t = setInterval(() => setProgressTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [anyGenerating]);

  // Trigger client-side do worker enquanto há items pending. Substitui
  // Vercel Cron porque conta Hobby não suporta cron sub-diário. Cada call
  // processa até 3 items por execução. Roda a cada 12s (mais espaçado que o
  // reload de 5s pra dar tempo de cada Claude call retornar).
  useEffect(() => {
    if (!hasInflight) return;
    let alive = true;
    const trigger = () => {
      if (!alive) return;
      fetch("/api/cron/study-plan-generator", {
        method: "POST",
        headers: { "content-type": "application/json" },
      }).catch(() => {});
    };
    trigger();
    const t = setInterval(trigger, 12_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [hasInflight]);

  const progress = useMemo(() => progressPercent(items), [items]);
  const days = useMemo(
    () => (plan ? daysUntilExam(plan.examDate) : null),
    [plan],
  );

  async function handleToggle(item: StudyPlanItem) {
    const next = item.status === "done" ? "pending" : "done";
    try {
      await updateItemStatusAsync(item.id, next);
      setItems((prev) =>
        prev.map((i) =>
          i.id === item.id
            ? {
                ...i,
                status: next,
                completedAt: next === "done" ? new Date().toISOString() : null,
              }
            : i,
        ),
      );
    } catch (err) {
      toast.error(`Não consegui atualizar: ${(err as Error).message}`);
    }
  }

  async function handleDeleteItem(item: StudyPlanItem) {
    try {
      await deleteItemAsync(item.id);
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      toast.success("Item removido.");
    } catch (err) {
      toast.error(`Não consegui remover: ${(err as Error).message}`);
    }
  }

  /**
   * Gera a rotina (PDF cronograma) chamando /api/lumi/routine com os dados
   * do RotinaWizardDialog. Custa 12 coins. Linka o documentId retornado
   * como asset_id do item.
   */
  const handleGenerateRotina = useCallback(
    async (item: StudyPlanItem, data: RotinaWizardSubmit) => {
      if (!plan?.subjectId) {
        toast.error(
          "Esse plano precisa estar atrelado a uma matéria pra gerar a rotina.",
        );
        throw new Error("no subject");
      }
      const toastId = toast.loading("Gerando rotina (PDF)…");
      try {
        const res = await fetch("/api/lumi/routine", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            subjectId: plan.subjectId,
            conteudo: data.conteudo,
            horasSemanais: data.horasSemanais,
            dataProva: plan.examDate ?? "",
            titulo: item.title,
          }),
        });
        const json = (await res.json()) as {
          documentId?: string;
          error?: string;
        };
        if (!res.ok || !json.documentId) {
          throw new Error(json.error ?? "Falha ao gerar rotina.");
        }
        await updateItemAsync(item.id, {
          assetId: json.documentId,
          status: "done",
        });
        setItems((prev) =>
          prev.map((i) =>
            i.id === item.id
              ? {
                  ...i,
                  assetId: json.documentId!,
                  status: "done",
                  completedAt: new Date().toISOString(),
                }
              : i,
          ),
        );
        toast.success("Rotina pronta! Abre o PDF pra ver.", { id: toastId });
      } catch (err) {
        toast.error(`Erro: ${(err as Error).message}`, { id: toastId });
        throw err;
      }
    },
    [plan],
  );

  /**
   * Anexa um PDF (upload) como Documento do item. Cria row em `documents`,
   * sobe binário no Storage e linka documentId em asset_id.
   * Reusa a mesma lógica do wizard pra Storage + Document.
   */
  const handleAttachPdf = useCallback(
    async (item: StudyPlanItem, file: File) => {
      if (!plan) return;
      if (file.type !== "application/pdf") {
        toast.error("Só PDF por aqui.");
        return;
      }
      if (file.size > 30 * 1024 * 1024) {
        toast.error("PDF acima de 30MB.");
        return;
      }
      const toastId = toast.loading("Anexando PDF…");
      try {
        // Cria document primeiro (sem texto — extração via index roda em bg).
        const doc = await createDocumentAsync({
          userId: user.id,
          subjectId: plan.subjectId,
          title: item.title || file.name.replace(/\.pdf$/i, ""),
          sourceKind: "pdf",
          sourceText: "",
          pageCount: undefined,
        });
        if (!doc) throw new Error("Falha ao criar documento.");

        // Sobe PDF binário no Storage
        const supabase = createSupabaseClient();
        const storageKey = `${user.id}/${doc.id}.pdf`;
        const { error: upErr } = await supabase.storage
          .from("user-documents")
          .upload(storageKey, file, {
            contentType: "application/pdf",
            upsert: true,
          });
        if (upErr) throw new Error(upErr.message);

        const { data: pub } = supabase.storage
          .from("user-documents")
          .getPublicUrl(storageKey);
        if (pub?.publicUrl) {
          await supabase
            .from("documents")
            .update({ source_url: pub.publicUrl })
            .eq("id", doc.id);
        }

        await updateItemAsync(item.id, {
          assetId: doc.id,
          status: "done",
        });
        setItems((prev) =>
          prev.map((i) =>
            i.id === item.id
              ? {
                  ...i,
                  assetId: doc.id,
                  status: "done",
                  completedAt: new Date().toISOString(),
                }
              : i,
          ),
        );
        toast.success("PDF anexado.", { id: toastId });
      } catch (err) {
        toast.error(`Erro: ${(err as Error).message}`, { id: toastId });
      }
    },
    [plan, user.id],
  );

  /**
   * Linka o asset gerado pelo ContentWizard ao item da trilha.
   * Pra mindmap/quiz/flashcards, asset_id = lecture_assets.id (assetRowId).
   * Pra summary, asset_id = summaries.id (rota /resumo/doc/[id]).
   */
  const handleAssetGenerated = useCallback(
    async (result: {
      lectureId?: string;
      summaryId?: string;
      documentId?: string;
      assetRowId?: string;
      mode: AIMode;
    }) => {
      if (!genItem) return;
      let assetId: string | null = null;
      if (result.mode === "summary") {
        assetId = result.summaryId ?? null;
      } else {
        // flashcards | quiz | mindmap
        assetId = result.assetRowId ?? null;
      }
      if (!assetId) {
        toast.warning(
          "Asset criado mas não consegui linkar ao item. Marca manualmente quando estudar.",
        );
        setGenItem(null);
        return;
      }
      try {
        await updateItemAsync(genItem.id, {
          assetId,
          status: "done",
        });
        setItems((prev) =>
          prev.map((i) =>
            i.id === genItem.id
              ? {
                  ...i,
                  assetId,
                  status: "done",
                  completedAt: new Date().toISOString(),
                }
              : i,
          ),
        );
        toast.success("Asset linkado à trilha.");
      } catch (err) {
        toast.error(`Não consegui linkar: ${(err as Error).message}`);
      } finally {
        setGenItem(null);
      }
    },
    [genItem],
  );

  async function handleDeletePlan() {
    if (!plan) return;
    const ok = await confirmAction({
      title: "Excluir este plano?",
      description: "Todos os itens do plano serão removidos. Essa ação não dá pra desfazer.",
      destructive: true,
      confirmText: "Excluir plano",
    });
    if (!ok) return;
    try {
      await deletePlanAsync(plan.id);
      toast.success("Plano excluído.");
      router.push("/planos");
    } catch (err) {
      toast.error(`Não consegui excluir: ${(err as Error).message}`);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Carregando plano…
      </div>
    );
  }

  if (notFound || !plan) {
    return (
      <div className="mx-auto w-full max-w-[900px] px-4 py-10 text-center">
        <h1 className="text-xl font-semibold">Plano não encontrado</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Pode ter sido removido ou não pertence a você.
        </p>
        <Link
          href="/planos"
          className="mt-4 inline-flex items-center gap-1 text-sm text-primary hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar pra meus planos
        </Link>
      </div>
    );
  }

  const examDateLabel = formatExamDate(plan.examDate);

  return (
    // Mesmo padrão de /planos: flow natural (sem trava de viewport).
    // Em desktop reduzimos py e o mb dos blocos pra que o caso comum
    // (header + progress + 4-8 itens) caiba sem forçar scroll.
    <div className="mx-auto w-full max-w-[900px] px-4 py-6 lg:px-8 lg:py-5">
      {/* Voltar pra aba do menu (Plano de Estudos) */}
      <BackToHub className="mb-3" />

      {/* Breadcrumb */}
      <Link
        href="/planos"
        className="mb-4 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Meus planos
      </Link>

      {/* Header */}
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-start md:justify-between lg:mb-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-primary">
              <Target className="h-3 w-3" />
              {subjectName ?? "Geral"}
            </span>
            {plan.status === "done" ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-emerald-600">
                <CheckCircle2 className="h-3 w-3" />
                Concluído
              </span>
            ) : null}
          </div>
          <h1 className="mt-1.5 text-2xl font-bold leading-tight md:text-3xl">
            {plan.title}
          </h1>
          {examDateLabel ? (
            <p className="mt-1 text-sm text-muted-foreground">
              Prova em {examDateLabel}
              {days !== null && days >= 0
                ? ` · ${days === 0 ? "hoje" : days === 1 ? "amanhã" : `${days} dias`}`
                : ""}
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => setAddOpen(true)} className="gap-1.5">
            <Plus className="h-4 w-4" />
            Adicionar item
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Mais ações">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                className="text-rose-600 focus:text-rose-600"
                onClick={handleDeletePlan}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Excluir plano
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mb-6 rounded-2xl border border-border/60 bg-card p-4 lg:mb-4 lg:p-3">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium text-foreground">
            {items.length === 0
              ? "Trilha vazia"
              : `${items.filter((i) => i.status === "done").length} de ${items.length} concluídos`}
          </span>
          <span className="font-semibold text-primary">{progress}%</span>
        </div>
        {/* Badge ao vivo quando há geração em background */}
        {hasInflight && (
          <p className="mt-1.5 text-[11px] text-sky-600 inline-flex items-center gap-1.5">
            <Loader2 className="h-3 w-3 animate-spin" />
            {items.filter((i) => i.status === "generating").length} gerando ·{" "}
            {items.filter(
              (i) =>
                i.status === "pending" &&
                (i.sourceDocumentId || i.sourceLectureId),
            ).length}{" "}
            na fila
          </p>
        )}
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full rounded-full bg-primary transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Trail */}
      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/60 bg-card/50 p-10 text-center">
          <Route className="mx-auto h-10 w-10 text-muted-foreground/60" />
          <h2 className="mt-3 text-sm font-semibold">Sem itens na trilha</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Adicione documentos, resumos, quizzes ou notas livres pra montar seu
            roteiro de estudo.
          </p>
          <Button
            onClick={() => setAddOpen(true)}
            variant="outline"
            className="mt-4 gap-1.5"
          >
            <Plus className="h-4 w-4" />
            Adicionar o primeiro item
          </Button>
        </div>
      ) : (
        <ol className="flex flex-col gap-2">
          {items.map((item, idx) => {
            // progressTick força re-render a cada 1s pra recalcular Date.now().
            void progressTick;
            const startedAt = generatingStartRef.current.get(item.id) ?? null;
            const eta = KIND_ETA_MS[item.kind] ?? 30_000;
            const progressPct =
              item.status === "generating" && startedAt
                ? Math.min(95, Math.round(((Date.now() - startedAt) / eta) * 100))
                : null;
            return (
              <TrailItem
                key={item.id}
                item={item}
                index={idx}
                progressPct={progressPct}
                onToggle={() => void handleToggle(item)}
                onDelete={() => void handleDeleteItem(item)}
                onGenerate={() => setGenItem(item)}
                onGenerateRotina={() => setRotinaItem(item)}
                onAttachPdf={(file) => void handleAttachPdf(item, file)}
              />
            );
          })}
        </ol>
      )}

      <AddItemDialog
        planId={planId}
        open={addOpen}
        onOpenChange={setAddOpen}
        onAdded={(item) => setItems((prev) => [...prev, item])}
      />

      {/* ContentWizard reaproveitado pra Fase 4: cada item gerável vira asset
          real (summary/mindmap/quiz/flashcards) ancorado na matéria do plano. */}
      {genItem && WIZARD_KINDS.includes(genItem.kind) && (
        <ContentWizard
          open={!!genItem}
          onOpenChange={(v) => {
            if (!v) setGenItem(null);
          }}
          mode={genItem.kind as AIMode}
          userId={user.id}
          initialSubjectId={plan.subjectId ?? undefined}
          onCreated={(r) => void handleAssetGenerated(r)}
        />
      )}

      {/* Wizard pra Rotina — coleta tópicos + horas/semana antes de chamar API. */}
      {rotinaItem && (
        <RotinaWizardDialog
          open={!!rotinaItem}
          onOpenChange={(v) => {
            if (!v) setRotinaItem(null);
          }}
          subjectName={subjectName ?? "Geral"}
          examDateLabel={examDateLabel}
          itemTitle={rotinaItem.title}
          initialConteudo={rotinaItem.description ?? ""}
          onSubmit={(data) => handleGenerateRotina(rotinaItem, data)}
        />
      )}
    </div>
  );
}

function TrailItem({
  item,
  index,
  progressPct,
  onToggle,
  onDelete,
  onGenerate,
  onGenerateRotina,
  onAttachPdf,
}: {
  item: StudyPlanItem;
  index: number;
  /** % estimada quando o worker está gerando o asset. `null` quando o
   *  item não está em generating. Calculada no parent baseada em ETA por kind. */
  progressPct: number | null;
  onToggle: () => void;
  onDelete: () => void;
  /** Abre ContentWizard (summary/mindmap/quiz/flashcards). */
  onGenerate: () => void;
  /** Dispara /api/lumi/routine direto. */
  onGenerateRotina: () => void;
  /** Recebe o PDF selecionado pelo input file. */
  onAttachPdf: (file: File) => void;
}) {
  const Icon = KIND_ICON[item.kind];
  const tone = KIND_TONE[item.kind];
  const done = item.status === "done";
  const [expanded, setExpanded] = useState(false);
  const hasDescription = !!item.description && item.description.length > 0;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const generatable = GENERATABLE_KINDS.includes(item.kind);
  const isWizardKind = WIZARD_KINDS.includes(item.kind);
  const isRoutine = item.kind === "routine";
  const isDocument = item.kind === "document";
  const externalAssetHref = assetHrefFor(item);
  const inPlanKinds: StudyPlanItemKind[] = [
    "summary",
    "flashcards",
    "quiz",
    "mindmap",
  ];
  const hasSource = !!item.sourceDocumentId || !!item.sourceLectureId;
  // Atalho: summary PRONTO com aula vinculada vai direto pra /lecture canônica
  // (esqueleto unificado com tabs/imagens/TTS).
  const directLectureSummary =
    item.kind === "summary" &&
    item.status === "done" &&
    !!item.sourceLectureId;
  const usePlanItemRoute =
    !directLectureSummary && inPlanKinds.includes(item.kind) && hasSource;
  const assetHref = directLectureSummary
    ? `/lecture/${item.sourceLectureId}?tab=summary`
    : usePlanItemRoute
      ? `/planos/${item.planId}/item/${item.id}`
      : externalAssetHref;
  // `hasAsset` indica que o item TEM uma rota pra abrir agora — usado pelo
  // botão "Abrir". Pode ser true mesmo enquanto o asset ainda está gerando,
  // porque a tela do plano-item lida com pending/failed/done sozinha.
  const hasAsset = !!assetHref;
  // `isReady` significa "asset realmente gerado" — usado pelo badge "Pronto".
  // Antes era acoplado a hasAsset, mas com a nova rota interna hasAsset virou
  // sempre-true pra items in-plan e o badge aparecia em items ainda na fila.
  const isReady = !!item.assetId && item.status === "done";

  return (
    <li
      className={cn(
        "flex items-start gap-3 rounded-2xl border border-border/60 bg-card p-4 transition-colors",
        done && "bg-emerald-500/5 border-emerald-500/20",
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 transition-all",
          done
            ? "border-emerald-500 bg-emerald-500 text-white"
            : "border-border bg-background text-transparent hover:border-primary",
        )}
        aria-label={done ? "Desmarcar" : "Marcar como concluído"}
      >
        {done ? <Check className="h-4 w-4" /> : <Circle className="h-3 w-3" />}
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-medium",
              tone,
            )}
          >
            <Icon className="h-3 w-3" />
            {ITEM_KIND_LABEL[item.kind]}
          </span>
          <span className="text-[11px] text-muted-foreground">
            #{index + 1}
          </span>
          {isReady && (
            <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600">
              <CheckCircle2 className="h-3 w-3" />
              Pronto
            </span>
          )}
          {item.status === "generating" && (
            <span className="inline-flex items-center gap-1 rounded-md border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-[10px] font-medium text-sky-600">
              <Loader2 className="h-3 w-3 animate-spin" />
              Gerando…
            </span>
          )}
          {item.status === "pending" && item.sourceDocumentId === null &&
            item.sourceLectureId === null && (
              <span className="inline-flex items-center gap-1 rounded-md border border-muted-foreground/30 bg-muted/50 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                <Circle className="h-3 w-3" />
                Pendente
              </span>
            )}
          {item.status === "pending" &&
            (item.sourceDocumentId !== null || item.sourceLectureId !== null) && (
              <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-600">
                <Loader2 className="h-3 w-3 animate-spin" />
                Na fila…
              </span>
            )}
          {item.status === "failed" && (
            <span
              className="inline-flex items-center gap-1 rounded-md border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-[10px] font-medium text-rose-600"
              title={item.errorMessage ?? undefined}
            >
              <AlertCircle className="h-3 w-3" />
              Falhou
            </span>
          )}
        </div>
        <h3
          className={cn(
            "mt-1 text-sm font-semibold leading-snug",
            done && "text-muted-foreground line-through",
          )}
        >
          {item.title}
        </h3>

        {/* Barra de progresso. Em `generating` mostra % estimada (ETA fixo por
            kind, trava em 95% até o reload confirmar done). Em `pending` com
            source mostra animação indeterminada (waiting in queue). */}
        {item.status === "generating" && progressPct !== null && (
          <div className="mt-2 space-y-1">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-sky-500 transition-all duration-700 ease-out"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <p className="text-[10px] text-muted-foreground">
              {progressPct < 95
                ? `~${progressPct}% — Lumi está gerando agora`
                : "quase lá — finalizando…"}
            </p>
          </div>
        )}
        {item.status === "pending" &&
          (item.sourceDocumentId !== null || item.sourceLectureId !== null) && (
            <div className="mt-2 space-y-1">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div className="h-full w-full animate-pulse rounded-full bg-amber-400/40" />
              </div>
              <p className="text-[10px] text-muted-foreground">
                aguardando o worker pegar — até 3 items processam em paralelo
              </p>
            </div>
          )}

        {hasDescription && (
          <>
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="mt-1 inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
            >
              <ChevronDown
                className={cn(
                  "h-3 w-3 transition-transform",
                  expanded && "rotate-180",
                )}
              />
              {expanded ? "Esconder detalhes" : "Ver detalhes"}
            </button>
            {expanded && (
              <p className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">
                {item.description}
              </p>
            )}
          </>
        )}

        {/* Ações de asset: abrir quando existe, gerar quando ainda não.
            Cada kind tem um fluxo: wizard, rotina API, ou upload PDF. */}
        {(generatable || hasAsset) && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {hasAsset && assetHref ? (
              <Link href={assetHref}>
                <Button size="sm" variant="outline" className="gap-1.5">
                  <ExternalLink className="h-3.5 w-3.5" />
                  Abrir {ITEM_KIND_LABEL[item.kind].toLowerCase()}
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </Link>
            ) : isWizardKind ? (
              <Button size="sm" onClick={onGenerate} className="gap-1.5">
                <Wand2 className="h-3.5 w-3.5" />
                Gerar agora
              </Button>
            ) : isRoutine ? (
              <Button
                size="sm"
                onClick={onGenerateRotina}
                className="gap-1.5"
              >
                <Wand2 className="h-3.5 w-3.5" />
                Gerar rotina (PDF · 12 coins)
              </Button>
            ) : isDocument ? (
              <>
                <Button
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  className="gap-1.5"
                >
                  <Wand2 className="h-3.5 w-3.5" />
                  Anexar PDF
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) onAttachPdf(f);
                    e.target.value = ""; // permite reselect mesmo arquivo
                  }}
                />
              </>
            ) : null}
          </div>
        )}
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Ações do item">
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            className="text-rose-600 focus:text-rose-600"
            onClick={onDelete}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Remover
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}

function AddItemDialog({
  planId,
  open,
  onOpenChange,
  onAdded,
}: {
  planId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onAdded: (item: StudyPlanItem) => void;
}) {
  const [kind, setKind] = useState<StudyPlanItemKind>("note");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit() {
    if (!title.trim()) {
      toast.error("Dá um título pro item.");
      return;
    }
    setSaving(true);
    try {
      const item = await addItemAsync({
        planId,
        kind,
        title: title.trim(),
        description: description.trim() || undefined,
      });
      if (!item) throw new Error("Falha ao adicionar.");
      onAdded(item);
      setTitle("");
      setDescription("");
      setKind("note");
      onOpenChange(false);
      toast.success("Item adicionado.");
    } catch (err) {
      toast.error(`Não consegui adicionar: ${(err as Error).message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5 text-primary" />
            Novo item na trilha
          </DialogTitle>
          <DialogDescription>
            Adicione um passo manual. Em breve dá pra puxar resumos, mapas e
            quizzes que você já tem.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-1.5">
            <Label htmlFor="item-kind">Tipo</Label>
            <select
              id="item-kind"
              value={kind}
              onChange={(e) => setKind(e.target.value as StudyPlanItemKind)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {(
                Object.keys(ITEM_KIND_LABEL) as StudyPlanItemKind[]
              ).map((k) => (
                <option key={k} value={k}>
                  {ITEM_KIND_LABEL[k]}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="item-title">Título</Label>
            <Input
              id="item-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Ler resumo de tireoide"
              maxLength={200}
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="item-desc">Descrição (opcional)</Label>
            <Textarea
              id="item-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Anotações, links, técnica de estudo…"
              maxLength={2000}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={saving} className="gap-1.5">
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Adicionando…
              </>
            ) : (
              <>
                <Plus className="h-4 w-4" />
                Adicionar
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function PlanoTrilhaPage() {
  return (
    <AuthGuard>
      {(user) => (
        <AppShell user={user}>
          <PlanoView user={user} />
        </AppShell>
      )}
    </AuthGuard>
  );
}
