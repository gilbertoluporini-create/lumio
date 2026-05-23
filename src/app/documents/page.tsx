"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ChevronDown,
  ChevronRight,
  Clock,
  Mic,
  Search,
} from "lucide-react";
import { AuthGuard } from "@/components/app/auth-guard";
import { AppShell } from "@/components/app/app-shell";
import { LumiCharacter } from "@/components/brand/lumi";
import { LumiIcon, type LumiIconName } from "@/components/brand/lumi-icon";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  listLecturesAsync,
  listSubjectsAsync,
} from "@/lib/db";
import type { Lecture, Subject, User } from "@/lib/types";
import { cn, formatRelativeTime } from "@/lib/utils";

type Filter = "all" | "lectures" | "generated" | "uploaded";

const FILTER_LABELS: Record<Filter, string> = {
  all: "Tudo",
  lectures: "Aulas",
  generated: "Gerados",
  uploaded: "Uploadados",
};

export default function DocumentsPage() {
  return (
    <AuthGuard>
      {(user) => (
        <AppShell user={user}>
          <DocumentsView user={user} />
        </AppShell>
      )}
    </AuthGuard>
  );
}

function DocumentsView({ user }: { user: User }) {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [lectures, setLectures] = useState<Lecture[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let active = true;
    Promise.all([
      listSubjectsAsync(user.id),
      listLecturesAsync(user.id),
    ])
      .then(([s, l]) => {
        if (!active) return;
        setSubjects(s);
        setLectures(l);
        // Expandir tudo por padrão
        const initExp: Record<string, boolean> = {};
        s.forEach((sub) => (initExp[sub.id] = true));
        setExpanded(initExp);
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [user.id]);

  const lecturesBySubject = useMemo(() => {
    const map: Record<string, Lecture[]> = {};
    for (const l of lectures) {
      if (!map[l.subjectId]) map[l.subjectId] = [];
      map[l.subjectId].push(l);
    }
    return map;
  }, [lectures]);

  const stats = useMemo(() => {
    const totalLectures = lectures.length;
    const totalSummaries = lectures.filter((l) => l.summary).length;
    const totalSlides = lectures.filter((l) => (l.slides?.length ?? 0) > 0)
      .length;
    return { totalLectures, totalSummaries, totalSlides };
  }, [lectures]);

  // Filtragem por query
  const q = query.trim().toLowerCase();
  const matchesQuery = (text: string) => !q || text.toLowerCase().includes(q);

  function toggleSubject(subjectId: string) {
    setExpanded((prev) => ({ ...prev, [subjectId]: !prev[subjectId] }));
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl px-5 py-8">
        <div className="h-8 w-48 rounded-md bg-secondary/50 animate-pulse mb-3" />
        <div className="h-4 w-64 rounded-md bg-secondary/40 animate-pulse mb-8" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-20 rounded-xl bg-secondary/30 animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  if (subjects.length === 0) {
    return (
      <div className="mx-auto max-w-6xl px-5 py-16 text-center">
        <LumiCharacter mood="sleeping" size="lg" />
        <h1 className="mt-4 text-xl font-semibold">Nada por aqui ainda</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Crie uma matéria e grave uma aula pra começar a popular seus
          documentos.
        </p>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 mt-4 text-sm text-primary hover:underline"
        >
          Voltar ao dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-5 py-8">
      {/* Header */}
      <div className="mb-8 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="text-sm text-muted-foreground mb-1">
            Documentos · {stats.totalLectures} aula
            {stats.totalLectures === 1 ? "" : "s"} ·{" "}
            {stats.totalSummaries} resumo
            {stats.totalSummaries === 1 ? "" : "s"} · {stats.totalSlides} com
            slides
          </div>
          <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">
            Meus documentos
          </h1>
        </div>
      </div>

      {/* Search + filters */}
      <div className="mb-6 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Buscar aula, matéria…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-1.5">
          {(Object.keys(FILTER_LABELS) as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                filter === f
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-secondary/60",
              )}
            >
              {FILTER_LABELS[f]}
            </button>
          ))}
        </div>
      </div>

      {/* Tree */}
      <div className="space-y-2">
        {subjects.map((s) => {
          const subLectures = (lecturesBySubject[s.id] ?? []).filter((l) =>
            matchesQuery(l.title),
          );
          const isExpanded = expanded[s.id] ?? true;
          const subMatchesQuery = matchesQuery(s.name);

          // Esconde matérias sem aulas que correspondem à query
          if (q && !subMatchesQuery && subLectures.length === 0) return null;

          return (
            <div
              key={s.id}
              className="rounded-xl border border-border/60 bg-card overflow-hidden"
            >
              <button
                onClick={() => toggleSubject(s.id)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-secondary/30 transition-colors text-left"
              >
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                )}
                <div
                  className={cn(
                    "h-9 w-9 shrink-0 rounded-lg bg-gradient-to-br shadow-sm flex items-center justify-center",
                    s.color,
                  )}
                >
                  <LumiIcon name="book" size={22} className="brightness-200" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-sm truncate">{s.name}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {subLectures.length} aula
                    {subLectures.length === 1 ? "" : "s"}
                  </div>
                </div>
                <Link
                  href={`/subject/${s.id}`}
                  onClick={(e) => e.stopPropagation()}
                  className="text-[11px] text-primary hover:underline shrink-0"
                >
                  Abrir pasta
                </Link>
              </button>

              {isExpanded && subLectures.length > 0 && (
                <div className="border-t border-border/40 divide-y divide-border/30">
                  {subLectures.map((l) => (
                    <LectureRow key={l.id} lecture={l} filter={filter} />
                  ))}
                </div>
              )}

              {isExpanded && subLectures.length === 0 && (
                <div className="border-t border-border/40 px-12 py-4 text-xs text-muted-foreground">
                  Sem aulas {q && "com esse termo"} ainda.
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LectureRow({ lecture, filter }: { lecture: Lecture; filter: Filter }) {
  const hasTranscript = lecture.transcript.trim().length > 0;
  const hasSlides = (lecture.slides?.length ?? 0) > 0;
  const hasSummary = !!lecture.summary;
  const msgCount = lecture.messages.length;

  // Construir lista de "documentos" virtuais dessa aula
  type Doc = {
    label: string;
    icon: LumiIconName;
    href: string;
    kind: "uploaded" | "generated" | "lecture";
    detail: string;
  };
  const docs: Doc[] = [];

  if (hasTranscript) {
    docs.push({
      label: "Transcrição",
      icon: "document",
      href: `/lecture/${lecture.id}?tab=transcript`,
      kind: "generated",
      detail: `${lecture.transcript.split(/\s+/).length} palavras`,
    });
  }
  if (hasSlides) {
    docs.push({
      label: "Slides extraídos",
      icon: "layers",
      href: `/lecture/${lecture.id}?tab=slides`,
      kind: "uploaded",
      detail: `${lecture.slides!.length} slide${
        lecture.slides!.length === 1 ? "" : "s"
      }${lecture.slidesFileName ? ` · ${lecture.slidesFileName}` : ""}`,
    });
  }
  if (msgCount > 0) {
    docs.push({
      label: "Dúvidas do chat",
      icon: "chat",
      href: `/lecture/${lecture.id}?tab=qa`,
      kind: "generated",
      detail: `${msgCount} mensagem${msgCount === 1 ? "" : "s"}`,
    });
  }
  if (hasSummary) {
    docs.push({
      label: "Resumo estruturado",
      icon: "sparkle",
      href: `/lecture/${lecture.id}?tab=summary`,
      kind: "generated",
      detail: "Asset gerado",
    });
  }

  // Aplica filtro
  const visibleDocs = docs.filter((d) => {
    if (filter === "all" || filter === "lectures") return true;
    return d.kind === filter;
  });

  return (
    <div className="pl-12 pr-4 py-3">
      <Link
        href={`/lecture/${lecture.id}`}
        className="flex items-center gap-2 mb-2 group"
      >
        <Mic className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className="font-medium text-sm group-hover:text-primary transition-colors truncate">
          {lecture.title}
        </span>
        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground shrink-0">
          <Clock className="h-2.5 w-2.5" />
          {formatRelativeTime(lecture.createdAt)}
        </span>
        {lecture.status === "live" && (
          <Badge variant="live" className="text-[10px] gap-1 shrink-0">
            <span className="h-1 w-1 rounded-full bg-red-500 pulse-dot" /> Ao
            vivo
          </Badge>
        )}
      </Link>

      {visibleDocs.length > 0 && filter !== "lectures" && (
        <div className="ml-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          {visibleDocs.map((d) => (
            <Link
              key={d.label}
              href={d.href}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-md hover:bg-secondary/50 transition-colors"
            >
              <LumiIcon name={d.icon} size={22} className="shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-xs font-medium truncate">{d.label}</div>
                <div className="text-[10px] text-muted-foreground truncate">
                  {d.detail}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {visibleDocs.length === 0 && filter !== "lectures" && (
        <div className="ml-5 text-[11px] text-muted-foreground italic">
          Sem documentos {filter !== "all" ? FILTER_LABELS[filter] : ""} nesta
          aula.
        </div>
      )}
    </div>
  );
}
