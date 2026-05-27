"use client";

/**
 * /documentos — Biblioteca de matérias.
 *
 * Estratégia: em vez de listar TODOS os arquivos flat, mostra um grid limpo
 * de matérias com contadores. Clicar numa matéria abre /subject/[id] que já
 * é a tela rica organizada (aulas + PDFs + resumos + assets).
 *
 * Seção "Não atribuídos" no rodapé só aparece se houver PDFs sem subject.
 */

import { createElement, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, FileText, FolderPlus, Plus, Search } from "lucide-react";
import { AuthGuard } from "@/components/app/auth-guard";
import { AppShell } from "@/components/app/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LumiCharacter } from "@/components/brand/lumi";
import { getSubjectIcon } from "@/lib/subject-icon";
import { AssignSubjectDialog } from "@/components/documents/assign-subject-dialog";
import {
  useAllDocuments,
  type DocumentItem,
} from "@/hooks/use-all-documents";
import { formatRelativeTime } from "@/lib/utils";
import type { Subject, User } from "@/lib/types";

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

type SubjectStats = {
  lectures: number;
  pdfs: number;
  summaries: number;
  flashcards: number;
  quizzes: number;
  mindmaps: number;
  total: number;
};

function DocumentosView({ user }: { user: User }) {
  const { documents, subjects, lectures, loading, refresh } = useAllDocuments(
    user.id,
  );
  const [query, setQuery] = useState("");
  const [assignDoc, setAssignDoc] = useState<DocumentItem | null>(null);

  /** Stats agregados por matéria (lectures + docs por kind). */
  const statsBySubject = useMemo(() => {
    const map: Record<string, SubjectStats> = {};
    for (const s of subjects) {
      map[s.id] = {
        lectures: 0,
        pdfs: 0,
        summaries: 0,
        flashcards: 0,
        quizzes: 0,
        mindmaps: 0,
        total: 0,
      };
    }
    for (const l of lectures) {
      if (!map[l.subjectId]) continue;
      map[l.subjectId].lectures += 1;
      map[l.subjectId].total += 1;
    }
    for (const d of documents) {
      if (!d.subjectId || !map[d.subjectId]) continue;
      const s = map[d.subjectId];
      if (d.kind === "pdf-upload") s.pdfs += 1;
      else if (d.kind === "summary") s.summaries += 1;
      else if (d.kind === "flashcards") s.flashcards += 1;
      else if (d.kind === "quiz") s.quizzes += 1;
      else if (d.kind === "mindmap") s.mindmaps += 1;
      // transcription já é contada via lectures, evita dupla contagem
      if (d.kind !== "transcription") s.total += 1;
    }
    return map;
  }, [subjects, lectures, documents]);

  const totalAssetCount = useMemo(
    () =>
      Object.values(statsBySubject).reduce((acc, s) => acc + s.total, 0),
    [statsBySubject],
  );

  /** PDFs uploadados que ainda não têm matéria associada. */
  const unassignedDocs = useMemo(
    () => documents.filter((d) => !d.subjectId && d.kind === "pdf-upload"),
    [documents],
  );

  const filteredSubjects = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return subjects;
    return subjects.filter((s) => s.name.toLowerCase().includes(q));
  }, [subjects, query]);

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl px-5 py-8">
        <div className="h-9 w-56 rounded-md bg-secondary/50 animate-pulse mb-3" />
        <div className="h-4 w-72 rounded-md bg-secondary/40 animate-pulse mb-8" />
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 auto-rows-fr">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="h-40 rounded-2xl bg-secondary/30 animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  if (subjects.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-16 text-center">
        <LumiCharacter mood="sleeping" size="lg" />
        <h1 className="mt-4 text-2xl heading-display">Nenhuma matéria ainda</h1>
        <p className="text-sm text-muted-foreground mt-2">
          Crie uma matéria no dashboard pra começar a organizar suas aulas,
          PDFs e resumos.
        </p>
        <Button asChild variant="gradient" className="mt-6">
          <Link href="/dashboard">
            <FolderPlus className="h-4 w-4" /> Criar matéria
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-5 py-8">
      {/* Header */}
      <div className="mb-6 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="text-sm text-muted-foreground mb-1">
            {subjects.length} matéria{subjects.length === 1 ? "" : "s"} ·{" "}
            {totalAssetCount} item{totalAssetCount === 1 ? "" : "s"}
          </div>
          <h1 className="text-3xl md:text-4xl heading-display">
            Meus documentos
          </h1>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/dashboard">
            <Plus className="h-4 w-4" /> Nova matéria
          </Link>
        </Button>
      </div>

      {/* Search */}
      {subjects.length > 4 && (
        <div className="mb-6 relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Buscar matéria…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      )}

      {/* Grid de matérias */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 auto-rows-fr">
        {filteredSubjects.map((s) => {
          const stats = statsBySubject[s.id] ?? {
            lectures: 0,
            pdfs: 0,
            summaries: 0,
            flashcards: 0,
            quizzes: 0,
            mindmaps: 0,
            total: 0,
          };
          return <SubjectCard key={s.id} subject={s} stats={stats} />;
        })}
      </div>

      {filteredSubjects.length === 0 && (
        <div className="text-center text-sm text-muted-foreground py-8">
          Nenhuma matéria encontrada com &quot;{query}&quot;.
        </div>
      )}

      {/* Não atribuídos */}
      {unassignedDocs.length > 0 && (
        <div className="mt-12">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">
              PDFs sem matéria{" "}
              <span className="text-muted-foreground font-normal">
                · {unassignedDocs.length}
              </span>
            </h2>
            <p className="text-xs text-muted-foreground">
              Atribua a uma matéria pra organizar.
            </p>
          </div>
          <div className="space-y-2">
            {unassignedDocs.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => setAssignDoc(d)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-border/60 bg-card hover:border-primary/40 hover:shadow-sm transition-all text-left"
              >
                <div className="h-9 w-9 shrink-0 rounded-lg bg-sky-500/10 dark:bg-sky-500/15 flex items-center justify-center">
                  <FileText className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{d.title}</div>
                  <div className="text-[11px] text-muted-foreground">
                    PDF · {formatRelativeTime(d.date)}
                  </div>
                </div>
                <span className="text-xs text-primary font-medium shrink-0">
                  Atribuir →
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Dialog: atribuir matéria */}
      <AssignSubjectDialog
        open={!!assignDoc}
        onOpenChange={(open) => {
          if (!open) setAssignDoc(null);
        }}
        doc={assignDoc}
        subjects={subjects}
        userId={user.id}
        onAssigned={() => {
          setAssignDoc(null);
          refresh();
        }}
      />
    </div>
  );
}

function SubjectCard({
  subject,
  stats,
}: {
  subject: Subject;
  stats: SubjectStats;
}) {
  const Icon = getSubjectIcon(subject.name);
  const items: Array<{ label: string; count: number }> = [
    { label: stats.lectures === 1 ? "aula" : "aulas", count: stats.lectures },
    { label: stats.pdfs === 1 ? "PDF" : "PDFs", count: stats.pdfs },
    {
      label: stats.summaries === 1 ? "resumo" : "resumos",
      count: stats.summaries,
    },
    {
      label: stats.flashcards === 1 ? "deck" : "decks",
      count: stats.flashcards,
    },
    { label: stats.quizzes === 1 ? "quiz" : "quizzes", count: stats.quizzes },
    {
      label: stats.mindmaps === 1 ? "mapa" : "mapas",
      count: stats.mindmaps,
    },
  ].filter((i) => i.count > 0);

  return (
    <Link
      href={`/subject/${subject.id}`}
      className="group h-full flex flex-col rounded-2xl border border-border/60 bg-card hover:border-primary/40 hover:shadow-md transition-all p-5"
    >
      <div className="flex items-start gap-3 mb-4">
        <div className="h-12 w-12 shrink-0 rounded-xl bg-primary/10 dark:bg-primary/15 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
          {createElement(Icon, {
            className: "h-6 w-6 text-primary",
            strokeWidth: 2.2,
          })}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-base leading-tight line-clamp-2 break-words group-hover:text-primary transition-colors">
            {subject.name}
          </h2>
          <div className="text-[11px] text-muted-foreground mt-1">
            {stats.total} item{stats.total === 1 ? "" : "s"}
          </div>
        </div>
        <ArrowRight className="h-4 w-4 text-muted-foreground/60 group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0" />
      </div>

      {items.length > 0 ? (
        <div className="mt-auto grid grid-cols-2 gap-1.5">
          {items.map((it) => (
            <div
              key={it.label}
              className="flex items-baseline gap-1.5 text-[12px]"
            >
              <span className="font-mono font-semibold tabular-nums text-foreground">
                {it.count}
              </span>
              <span className="text-muted-foreground">{it.label}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-auto text-[12px] text-muted-foreground italic">
          Sem material ainda — grave aula ou anexe PDF.
        </p>
      )}
    </Link>
  );
}
