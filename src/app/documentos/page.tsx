"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowRight,
  BookOpen,
  ChevronRight,
  CloudUpload,
  FileText,
  FolderOpen,
  FolderPlus,
  Plus,
  Search,
  Sparkles,
} from "lucide-react";
import { AuthGuard } from "@/components/app/auth-guard";
import { AppShell } from "@/components/app/app-shell";
import { ContentWizard } from "@/components/ai/content-wizard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LumiCharacter } from "@/components/brand/lumi";
import { DocumentItemRow } from "@/components/documents/document-item-row";
import { SubjectGroupCard } from "@/components/documents/subject-group-card";
import { AssignSubjectDialog } from "@/components/documents/assign-subject-dialog";
import { NewLectureDialog } from "@/components/documents/new-lecture-dialog";
import { DocumentIconBadge } from "@/components/documents/document-icon";
import {
  useAllDocuments,
  type DocumentItem,
  type DocumentKind,
  type DocumentOrigin,
} from "@/hooks/use-all-documents";
import { updateLectureAsync } from "@/lib/db";
import { cn } from "@/lib/utils";
import type { Subject, User } from "@/lib/types";

type TabId = "by-subject" | "unassigned" | "all";
type KindFilter = "all" | DocumentKind;
type OriginFilter = "all" | DocumentOrigin;

const KIND_FILTER_OPTIONS: Array<{ value: KindFilter; label: string }> = [
  { value: "all", label: "Todos os tipos" },
  { value: "transcription", label: "Transcrições" },
  { value: "summary", label: "Resumos" },
  { value: "flashcards", label: "Flashcards" },
  { value: "quiz", label: "Quizzes" },
  { value: "mindmap", label: "Mapas mentais" },
  { value: "pdf-upload", label: "PDFs" },
];

const ORIGIN_FILTER_OPTIONS: Array<{ value: OriginFilter; label: string }> = [
  { value: "all", label: "Toda origem" },
  { value: "lumio", label: "Gerados pelo Lumio" },
  { value: "upload", label: "Uploadados" },
];

const TABS: Array<{ id: TabId; label: string }> = [
  { id: "by-subject", label: "Por matéria" },
  { id: "unassigned", label: "Não atribuídos" },
  { id: "all", label: "Todos" },
];

export default function DocumentosPage() {
  return (
    <AuthGuard>
      {(user) => (
        <AppShell user={user}>
          <DocumentosView user={user} />
        </AppShell>
      )}
    </AuthGuard>
  );
}

function DocumentosView({ user }: { user: User }) {
  const router = useRouter();
  const { documents, subjects, loading, refresh } = useAllDocuments(user.id);

  const [tab, setTab] = useState<TabId>("by-subject");
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [originFilter, setOriginFilter] = useState<OriginFilter>("all");
  const [query, setQuery] = useState("");

  const [wizardOpen, setWizardOpen] = useState(false);
  const [newLectureOpen, setNewLectureOpen] = useState(false);
  const [assignTarget, setAssignTarget] = useState<DocumentItem | null>(null);
  const [assignSuggested, setAssignSuggested] = useState<string | null>(null);

  const uploadInputRef = useRef<HTMLInputElement>(null);

  /* ---------------- Filtering ---------------- */

  const q = query.trim().toLowerCase();
  const filteredAll = useMemo(() => {
    return documents.filter((d) => {
      if (kindFilter !== "all" && d.kind !== kindFilter) return false;
      if (originFilter !== "all" && d.origin !== originFilter) return false;
      if (q) {
        const blob =
          `${d.title} ${d.subjectName ?? ""} ${d.meta ?? ""}`.toLowerCase();
        if (!blob.includes(q)) return false;
      }
      return true;
    });
  }, [documents, kindFilter, originFilter, q]);

  /* ---------------- Group by subject ---------------- */

  const { docsBySubject, unassignedDocs, subjectMaxCount } = useMemo(() => {
    const bySubject = new Map<string, DocumentItem[]>();
    const unassigned: DocumentItem[] = [];
    let max = 0;
    for (const d of filteredAll) {
      if (d.subjectId) {
        const arr = bySubject.get(d.subjectId) ?? [];
        arr.push(d);
        bySubject.set(d.subjectId, arr);
      } else {
        unassigned.push(d);
      }
    }
    for (const [, list] of bySubject) {
      if (list.length > max) max = list.length;
    }
    return {
      docsBySubject: bySubject,
      unassignedDocs: unassigned,
      subjectMaxCount: Math.max(max, 16),
    };
  }, [filteredAll]);

  /* ---------------- KPIs (use ALL docs, ignore filters) ---------------- */

  const kpis = useMemo(() => {
    const subjectsWithDocs = new Set<string>();
    let unassignedCount = 0;
    let generatedCount = 0;
    for (const d of documents) {
      if (d.subjectId) subjectsWithDocs.add(d.subjectId);
      else unassignedCount++;
      if (d.origin === "lumio") generatedCount++;
    }
    return {
      total: documents.length,
      subjectsWithDocs: subjectsWithDocs.size,
      unassigned: unassignedCount,
      generated: generatedCount,
    };
  }, [documents]);

  /* ---------------- Suggestion engine ---------------- */

  const suggestSubjectFor = useMemo(() => {
    function normalize(s: string): string {
      return s
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "");
    }
    const subjectTokens = subjects.map((s) => ({
      subject: s,
      tokens: normalize(s.name)
        .split(/[^a-z0-9]+/)
        .filter((t) => t.length >= 3),
    }));
    return (doc: DocumentItem): Subject | null => {
      const haystack = normalize(`${doc.title} ${doc.meta ?? ""}`);
      let best: { subject: Subject; score: number } | null = null;
      for (const { subject, tokens } of subjectTokens) {
        if (tokens.length === 0) continue;
        let score = 0;
        for (const t of tokens) {
          if (haystack.includes(t)) score += t.length;
        }
        if (score > 0 && (!best || score > best.score)) {
          best = { subject, score };
        }
      }
      return best?.subject ?? null;
    };
  }, [subjects]);

  const suggestions = useMemo(() => {
    const out: Array<{ doc: DocumentItem; subject: Subject }> = [];
    for (const d of unassignedDocs) {
      const sug = suggestSubjectFor(d);
      if (sug) out.push({ doc: d, subject: sug });
      if (out.length >= 3) break;
    }
    return out;
  }, [unassignedDocs, suggestSubjectFor]);

  /* ---------------- Handlers ---------------- */

  function openAssign(doc: DocumentItem) {
    const sug = suggestSubjectFor(doc);
    setAssignTarget(doc);
    setAssignSuggested(sug?.id ?? null);
  }

  async function quickAssign(doc: DocumentItem, subjectId: string) {
    try {
      await updateLectureAsync(user.id, doc.lectureId, { subjectId });
      toast.success("Documento atribuído à matéria.");
      refresh();
    } catch (err) {
      toast.error(`Erro: ${(err as Error).message}`);
    }
  }

  function handleNewUpload() {
    uploadInputRef.current?.click();
  }

  function handleFileChosen(file: File | null) {
    if (!file) return;
    toast(
      "Pra enviar PDFs, abra uma aula e use o botão de slides — ou gere conteúdo com Lumio.",
      {
        description: file.name,
      },
    );
  }

  /* ---------------- Loading / empty ---------------- */

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-5 py-8">
        <div className="h-8 w-56 rounded-md bg-secondary/50 animate-pulse mb-2" />
        <div className="h-4 w-80 rounded-md bg-secondary/40 animate-pulse mb-8" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-20 rounded-xl bg-secondary/30 animate-pulse"
            />
          ))}
        </div>
        <div className="grid lg:grid-cols-[1fr_360px] gap-5">
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-44 rounded-2xl bg-secondary/25 animate-pulse"
              />
            ))}
          </div>
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-40 rounded-2xl bg-secondary/25 animate-pulse"
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  const emptyAll = documents.length === 0;

  return (
    <div className="mx-auto max-w-7xl px-5 py-8">
      {/* hidden file input pra "Novo upload" */}
      <input
        ref={uploadInputRef}
        type="file"
        accept="application/pdf"
        hidden
        onChange={(e) => handleFileChosen(e.target.files?.[0] ?? null)}
      />

      {/* Header */}
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-3xl font-semibold tracking-tight">
            Meus documentos
          </h1>
          <p className="mt-1 text-sm text-muted-foreground max-w-2xl">
            Tudo em um só lugar: uploads, resumos, PDFs, transcrições e
            materiais gerados pelo Lumio.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" onClick={handleNewUpload}>
            <CloudUpload className="h-4 w-4" /> Novo upload
          </Button>
          <Button
            variant="default"
            onClick={() => setNewLectureOpen(true)}
            title="Nova aula"
          >
            <Plus className="h-4 w-4" /> Nova aula
          </Button>
        </div>
      </header>

      {/* Filters row */}
      <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div
          role="tablist"
          aria-label="Filtros principais"
          className="inline-flex flex-wrap items-center gap-1.5"
        >
          {TABS.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(t.id)}
                className={cn(
                  "rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors",
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-secondary/60",
                )}
              >
                {t.label}
                {t.id === "unassigned" && kpis.unassigned > 0 && (
                  <span className="ml-1.5 inline-flex items-center justify-center rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 px-1.5 text-[10px] font-mono tabular-nums">
                    {kpis.unassigned}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 gap-1.5">
                <FileText className="h-3.5 w-3.5" />
                {KIND_FILTER_OPTIONS.find((o) => o.value === kindFilter)?.label}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {KIND_FILTER_OPTIONS.map((o) => (
                <DropdownMenuItem
                  key={o.value}
                  onClick={() => setKindFilter(o.value)}
                >
                  {o.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 gap-1.5">
                <Sparkles className="h-3.5 w-3.5" />
                {
                  ORIGIN_FILTER_OPTIONS.find((o) => o.value === originFilter)
                    ?.label
                }
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {ORIGIN_FILTER_OPTIONS.map((o) => (
                <DropdownMenuItem
                  key={o.value}
                  onClick={() => setOriginFilter(o.value)}
                >
                  {o.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="relative w-full sm:w-60">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Buscar documentos…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-8 h-9 text-sm"
            />
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="mb-6 grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          icon={<FileText className="h-4 w-4 text-primary" />}
          value={kpis.total}
          label={kpis.total === 1 ? "documento" : "documentos"}
        />
        <KpiCard
          icon={<BookOpen className="h-4 w-4 text-primary" />}
          value={kpis.subjectsWithDocs}
          label={kpis.subjectsWithDocs === 1 ? "matéria" : "matérias"}
        />
        <KpiCard
          icon={<FolderOpen className="h-4 w-4 text-primary" />}
          value={kpis.unassigned}
          label="não atribuídos"
        />
        <KpiCard
          icon={<Sparkles className="h-4 w-4 text-primary" />}
          value={kpis.generated}
          label="gerados pelo Lumio"
        />
      </div>

      {emptyAll ? (
        <EmptyState
          onNewLecture={() => setNewLectureOpen(true)}
          onWizard={() => setWizardOpen(true)}
        />
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          {/* Coluna principal */}
          <div className="min-w-0 space-y-4">
            {tab === "by-subject" && (
              <ByMateriaList
                subjects={subjects}
                docsBySubject={docsBySubject}
                subjectMaxCount={subjectMaxCount}
                unassignedDocs={unassignedDocs}
                onAssign={openAssign}
              />
            )}
            {tab === "all" && (
              <FlatDocsList
                docs={filteredAll}
                onAssign={openAssign}
                emptyLabel="Nenhum documento encontrado com esses filtros."
              />
            )}
            {tab === "unassigned" && (
              <FlatDocsList
                docs={unassignedDocs}
                onAssign={openAssign}
                emptyLabel="Tudo organizado! Você não tem documentos sem matéria."
              />
            )}
          </div>

          {/* Coluna direita */}
          <aside className="space-y-4 lg:sticky lg:top-20 self-start">
            <UnassignedCard
              docs={unassignedDocs}
              onAssign={openAssign}
              onSeeAll={() => setTab("unassigned")}
            />
            <SmartOrganizationCard />
            <SuggestionsCard
              suggestions={suggestions}
              onAccept={(doc, subjectId) => quickAssign(doc, subjectId)}
              onTune={openAssign}
            />
            <QuickActionsCard
              onCreateFolder={() => router.push("/dashboard")}
              onMoveToSubject={() => {
                if (unassignedDocs[0]) openAssign(unassignedDocs[0]);
                else toast("Nada pra mover — tudo já está organizado.");
              }}
              onGenerateSummary={() => setWizardOpen(true)}
              onImportPdf={handleNewUpload}
            />
          </aside>
        </div>
      )}

      <ContentWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        mode="summary"
        userId={user.id}
        onCreated={({ lectureId }) => {
          refresh();
          router.push(`/resumo/${lectureId}`);
        }}
      />

      <NewLectureDialog
        open={newLectureOpen}
        onOpenChange={setNewLectureOpen}
        userId={user.id}
        subjects={subjects}
      />

      <AssignSubjectDialog
        open={!!assignTarget}
        onOpenChange={(o) => {
          if (!o) setAssignTarget(null);
        }}
        doc={assignTarget}
        subjects={subjects}
        userId={user.id}
        suggestedSubjectId={assignSuggested}
        onAssigned={() => refresh()}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Sub-components                                                            */
/* -------------------------------------------------------------------------- */

function KpiCard({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: number;
  label: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-3">
      <span className="h-9 w-9 rounded-md bg-primary/10 dark:bg-primary/15 flex items-center justify-center shrink-0">
        {icon}
      </span>
      <div className="min-w-0">
        <div className="text-2xl font-semibold tabular-nums leading-none">
          {value}
        </div>
        <div className="text-[11px] text-muted-foreground mt-1 truncate">
          {label}
        </div>
      </div>
    </div>
  );
}

function ByMateriaList({
  subjects,
  docsBySubject,
  subjectMaxCount,
  unassignedDocs,
  onAssign,
}: {
  subjects: Subject[];
  docsBySubject: Map<string, DocumentItem[]>;
  subjectMaxCount: number;
  unassignedDocs: DocumentItem[];
  onAssign: (doc: DocumentItem) => void;
}) {
  const hasAnySubjectDoc = Array.from(docsBySubject.values()).some(
    (arr) => arr.length > 0,
  );

  if (subjects.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border/60 bg-card/50 p-8 text-center">
        <FolderPlus className="h-8 w-8 mx-auto text-muted-foreground/60 mb-3" />
        <h3 className="text-sm font-semibold">Sem matérias ainda</h3>
        <p className="text-xs text-muted-foreground mt-1 max-w-xs mx-auto">
          Crie uma matéria no dashboard pra organizar tudo aqui.
        </p>
        <Button asChild size="sm" className="mt-4">
          <Link href="/dashboard">Ir pro dashboard</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {!hasAnySubjectDoc && unassignedDocs.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground">
          Nenhum documento atribuído ainda. Veja a aba{" "}
          <span className="font-medium text-foreground">Não atribuídos</span>{" "}
          pra começar a organizar.
        </div>
      )}
      {subjects.map((s) => {
        const docs = docsBySubject.get(s.id) ?? [];
        const ratio = docs.length / subjectMaxCount;
        return (
          <SubjectGroupCard
            key={s.id}
            subject={s}
            docs={docs}
            totalOrgRatio={ratio}
            onAssignSubject={onAssign}
          />
        );
      })}
    </div>
  );
}

function FlatDocsList({
  docs,
  onAssign,
  emptyLabel,
}: {
  docs: DocumentItem[];
  onAssign: (doc: DocumentItem) => void;
  emptyLabel: string;
}) {
  if (docs.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border/60 bg-card/50 p-8 text-center text-sm text-muted-foreground">
        {emptyLabel}
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-border bg-card divide-y divide-border/40">
      {docs.map((d) => (
        <DocumentItemRow
          key={d.id}
          doc={d}
          onAssignSubject={onAssign}
          className="rounded-none px-4"
        />
      ))}
    </div>
  );
}

function UnassignedCard({
  docs,
  onAssign,
  onSeeAll,
}: {
  docs: DocumentItem[];
  onAssign: (doc: DocumentItem) => void;
  onSeeAll: () => void;
}) {
  const preview = docs.slice(0, 5);
  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <header className="flex items-center gap-2 mb-3">
        <span className="h-7 w-7 rounded-md bg-amber-500/15 text-amber-600 dark:text-amber-300 flex items-center justify-center shrink-0">
          <FolderOpen className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">Não atribuídos</div>
          <div className="text-[11px] text-muted-foreground">
            {docs.length} documento{docs.length === 1 ? "" : "s"}
          </div>
        </div>
      </header>
      {preview.length === 0 ? (
        <p className="text-xs text-muted-foreground py-4 text-center">
          Tudo organizado por aqui.
        </p>
      ) : (
        <div className="space-y-1">
          {preview.map((d) => (
            <div key={d.id} className="space-y-1">
              <DocumentItemRow doc={d} onAssignSubject={onAssign} compact />
              <button
                type="button"
                onClick={() => onAssign(d)}
                className="ml-10 text-[11px] text-primary hover:underline"
              >
                Atribuir matéria
              </button>
            </div>
          ))}
        </div>
      )}
      {docs.length > preview.length && (
        <button
          type="button"
          onClick={onSeeAll}
          className="mt-3 text-xs text-primary font-medium inline-flex items-center gap-1 hover:gap-1.5 transition-all"
        >
          Ver todos ({docs.length}) <ArrowRight className="h-3 w-3" />
        </button>
      )}
    </section>
  );
}

function SmartOrganizationCard() {
  return (
    <section className="rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/5 via-card to-fuchsia-500/5 p-5">
      <header className="flex items-center gap-2 mb-2">
        <span className="h-7 w-7 rounded-md bg-primary/15 text-primary flex items-center justify-center shrink-0">
          <Sparkles className="h-3.5 w-3.5" />
        </span>
        <h3 className="text-sm font-semibold">Organização inteligente</h3>
      </header>
      <p className="text-xs text-muted-foreground">
        O Lumio analisa seus documentos e sugere a matéria ideal pra manter tudo
        sempre organizado.
      </p>
      <div
        className="mt-4 flex items-center gap-2 justify-center"
        aria-hidden="true"
      >
        <span className="h-9 w-9 rounded-lg bg-secondary/60 border border-border/60 flex items-center justify-center">
          <FileText className="h-3.5 w-3.5 text-muted-foreground" />
        </span>
        <ArrowRight className="h-3 w-3 text-muted-foreground/60" />
        <span className="h-9 w-9 rounded-lg bg-primary/15 border border-primary/30 flex items-center justify-center">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
        </span>
        <ArrowRight className="h-3 w-3 text-muted-foreground/60" />
        <span className="h-9 w-9 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
          <FolderOpen className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-300" />
        </span>
      </div>
    </section>
  );
}

function SuggestionsCard({
  suggestions,
  onAccept,
  onTune,
}: {
  suggestions: Array<{ doc: DocumentItem; subject: Subject }>;
  onAccept: (doc: DocumentItem, subjectId: string) => void;
  onTune: (doc: DocumentItem) => void;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <header className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold">Sugestões automáticas</h3>
        <Sparkles className="h-3.5 w-3.5 text-primary" />
      </header>
      {suggestions.length === 0 ? (
        <p className="text-xs text-muted-foreground py-3">
          Sem sugestões agora. Quando algo novo aparecer sem matéria, o Lumio
          tenta adivinhar a melhor pasta pra ele.
        </p>
      ) : (
        <ul className="space-y-2">
          {suggestions.map(({ doc, subject }) => (
            <li
              key={doc.id}
              className="flex items-center gap-2 rounded-lg border border-border/60 bg-background/40 px-2 py-2"
            >
              <DocumentIconBadge kind={doc.kind} size={28} />
              <div className="min-w-0 flex-1">
                <div className="text-xs font-medium truncate">{doc.title}</div>
                <div className="text-[10px] text-muted-foreground truncate">
                  Sugerido: {subject.name}
                </div>
              </div>
              <button
                type="button"
                onClick={() => onAccept(doc, subject.id)}
                className="shrink-0 inline-flex items-center justify-center h-6 px-2 rounded-md bg-primary/10 text-primary text-[10px] font-medium hover:bg-primary/15"
                title={`Atribuir à matéria ${subject.name}`}
              >
                Aceitar
              </button>
              <button
                type="button"
                onClick={() => onTune(doc)}
                className="shrink-0 h-6 w-6 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-secondary/60"
                aria-label="Escolher outra matéria"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        className="mt-3 text-xs text-primary font-medium inline-flex items-center gap-1 hover:gap-1.5 transition-all disabled:opacity-50"
        disabled
        title="Em breve"
      >
        Ver todas as sugestões <ArrowRight className="h-3 w-3" />
      </button>
    </section>
  );
}

function QuickActionsCard({
  onCreateFolder,
  onMoveToSubject,
  onGenerateSummary,
  onImportPdf,
}: {
  onCreateFolder: () => void;
  onMoveToSubject: () => void;
  onGenerateSummary: () => void;
  onImportPdf: () => void;
}) {
  const actions: Array<{
    icon: React.ReactNode;
    label: string;
    onClick: () => void;
  }> = [
    {
      icon: <FolderPlus className="h-3.5 w-3.5 text-primary" />,
      label: "Criar pasta",
      onClick: onCreateFolder,
    },
    {
      icon: <ArrowRight className="h-3.5 w-3.5 text-primary" />,
      label: "Mover para matéria",
      onClick: onMoveToSubject,
    },
    {
      icon: <Sparkles className="h-3.5 w-3.5 text-primary" />,
      label: "Gerar resumo",
      onClick: onGenerateSummary,
    },
    {
      icon: <CloudUpload className="h-3.5 w-3.5 text-primary" />,
      label: "Importar PDF",
      onClick: onImportPdf,
    },
  ];
  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <header className="mb-3">
        <h3 className="text-sm font-semibold">Ações rápidas</h3>
      </header>
      <ul className="space-y-1.5">
        {actions.map((a) => (
          <li key={a.label}>
            <button
              type="button"
              onClick={a.onClick}
              className="w-full flex items-center gap-3 rounded-lg px-2.5 py-2 text-left hover:bg-secondary/50 transition-colors"
            >
              <span className="h-7 w-7 rounded-md bg-primary/10 dark:bg-primary/15 flex items-center justify-center shrink-0">
                {a.icon}
              </span>
              <span className="text-sm flex-1 truncate">{a.label}</span>
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function EmptyState({
  onNewLecture,
  onWizard,
}: {
  onNewLecture: () => void;
  onWizard: () => void;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-border/60 bg-card/50 p-10 text-center">
      <div className="flex justify-center mb-3">
        <LumiCharacter mood="sleeping" size="lg" float />
      </div>
      <h2 className="text-lg font-semibold">Sua biblioteca está vazia</h2>
      <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
        Comece criando uma aula pra gerar transcrição automática, ou peça ao
        Lumio pra montar um resumo a partir de um PDF.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        <Button variant="default" onClick={onNewLecture}>
          <Plus className="h-4 w-4" /> Nova aula
        </Button>
        <Button variant="outline" onClick={onWizard}>
          <Sparkles className="h-4 w-4" /> Gerar com Lumio
        </Button>
      </div>
    </div>
  );
}

