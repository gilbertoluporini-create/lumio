"use client";

/**
 * /planos/[id] — Trilha do plano de estudo.
 *
 * Lista os itens ordenados, com checkbox pra marcar concluído, barra de
 * progresso no topo e botão "Adicionar item". Asset linking (puxar resumo
 * existente, mapa, etc.) entra na Fase 3 com o Lumi orquestrando.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  Circle,
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
} from "lucide-react";
import { toast } from "sonner";
import { AuthGuard } from "@/components/app/auth-guard";
import { AppShell } from "@/components/app/app-shell";
import { Button } from "@/components/ui/button";
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
import {
  addItemAsync,
  daysUntilExam,
  deleteItemAsync,
  deletePlanAsync,
  getPlanAsync,
  ITEM_KIND_LABEL,
  progressPercent,
  updateItemStatusAsync,
  type StudyPlan,
  type StudyPlanItem,
  type StudyPlanItemKind,
} from "@/lib/study-plans";
import { cn } from "@/lib/utils";
import type { User } from "@/lib/types";

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

  const reload = useCallback(async () => {
    setLoading(true);
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

  async function handleDeletePlan() {
    if (!plan) return;
    if (!confirm("Excluir este plano e todos os itens? Essa ação não dá pra desfazer.")) return;
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
    <div className="mx-auto w-full max-w-[900px] px-4 py-6 lg:px-8 lg:py-8">
      {/* Breadcrumb */}
      <Link
        href="/planos"
        className="mb-4 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Meus planos
      </Link>

      {/* Header */}
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
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
      <div className="mb-6 rounded-2xl border border-border/60 bg-card p-4">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium text-foreground">
            {items.length === 0
              ? "Trilha vazia"
              : `${items.filter((i) => i.status === "done").length} de ${items.length} concluídos`}
          </span>
          <span className="font-semibold text-primary">{progress}%</span>
        </div>
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
          {items.map((item, idx) => (
            <TrailItem
              key={item.id}
              item={item}
              index={idx}
              onToggle={() => void handleToggle(item)}
              onDelete={() => void handleDeleteItem(item)}
            />
          ))}
        </ol>
      )}

      <AddItemDialog
        planId={planId}
        open={addOpen}
        onOpenChange={setAddOpen}
        onAdded={(item) => setItems((prev) => [...prev, item])}
      />
    </div>
  );
}

function TrailItem({
  item,
  index,
  onToggle,
  onDelete,
}: {
  item: StudyPlanItem;
  index: number;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const Icon = KIND_ICON[item.kind];
  const tone = KIND_TONE[item.kind];
  const done = item.status === "done";
  const [expanded, setExpanded] = useState(false);
  const hasDescription = !!item.description && item.description.length > 0;

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
        </div>
        <h3
          className={cn(
            "mt-1 text-sm font-semibold leading-snug",
            done && "text-muted-foreground line-through",
          )}
        >
          {item.title}
        </h3>
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
