"use client";

import { useMemo, useRef, useEffect, useState } from "react";
import { Bookmark, ChevronDown, Filter, Play, Search, Sparkles } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type {
  TranscriptEntry,
  TranscriptMarker,
  TranscriptTopic,
} from "@/lib/types";
import { TranscriptEntryRow } from "./transcript-entry";

type MarkerFilter = TranscriptMarker | "all";
type ViewMode = "flat" | "chapters";

const FILTERS: { id: MarkerFilter; label: string; dot: string }[] = [
  { id: "concept", label: "Conceitos-chave", dot: "bg-violet-500" },
  { id: "doubt", label: "Dúvidas", dot: "bg-amber-500" },
  { id: "example", label: "Exemplos", dot: "bg-emerald-500" },
];

const CHUNK_FALLBACK_SEC = 600; // 10 min por capítulo sintético quando não há topics

function formatTs(sec: number): string {
  const total = Math.max(0, Math.floor(sec));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

type ChapterGroup = {
  id: string;
  title: string;
  startSec: number;
  endSec: number;
  color?: TranscriptTopic["color"];
  entries: TranscriptEntry[];
};

function groupIntoChapters(
  entries: TranscriptEntry[],
  topics: TranscriptTopic[],
): ChapterGroup[] {
  if (entries.length === 0) return [];

  // Caso 1: temos topics reais (>=1) — agrupa por topic
  if (topics.length > 0) {
    const sorted = [...topics].sort((a, b) => a.startSec - b.startSec);
    // Garante um topic em 0 pra não perder entries antes do 1º
    if (sorted[0].startSec > 0) {
      sorted.unshift({
        id: "intro",
        title: "Introdução",
        startSec: 0,
        color: "violet",
      });
    }
    const groups: ChapterGroup[] = sorted.map((t, i) => ({
      id: t.id,
      title: t.title,
      startSec: t.startSec,
      endSec: sorted[i + 1]?.startSec ?? Number.POSITIVE_INFINITY,
      color: t.color,
      entries: [],
    }));
    for (const e of entries) {
      const g = groups.find((g) => e.startSec >= g.startSec && e.startSec < g.endSec);
      if (g) g.entries.push(e);
      else groups[0].entries.push(e);
    }
    // Ajusta endSec real pro último entry de cada chapter (pra mostrar duração)
    for (const g of groups) {
      if (g.entries.length > 0) {
        g.endSec = g.entries[g.entries.length - 1].endSec;
      }
    }
    return groups.filter((g) => g.entries.length > 0);
  }

  // Caso 2: sem topics — gera chunks sintéticos de 10min
  const totalSec = entries[entries.length - 1].endSec;
  const numChunks = Math.max(1, Math.ceil(totalSec / CHUNK_FALLBACK_SEC));
  const groups: ChapterGroup[] = Array.from({ length: numChunks }, (_, i) => ({
    id: `chunk-${i}`,
    title: `Parte ${i + 1}`,
    startSec: i * CHUNK_FALLBACK_SEC,
    endSec: (i + 1) * CHUNK_FALLBACK_SEC,
    entries: [],
  }));
  for (const e of entries) {
    const idx = Math.min(
      groups.length - 1,
      Math.floor(e.startSec / CHUNK_FALLBACK_SEC),
    );
    groups[idx].entries.push(e);
  }
  return groups.filter((g) => g.entries.length > 0);
}

export function LiveTranscriptColumn({
  entries,
  interim,
  isLive,
  keyTerms,
  hasAudio,
  search,
  activeFilter,
  topics = [],
  onSearchChange,
  onFilterChange,
  onPlay,
  onJumpToSlide,
  onAddMarker,
}: {
  entries: TranscriptEntry[];
  interim: string;
  isLive: boolean;
  keyTerms: string[];
  hasAudio: boolean;
  search: string;
  activeFilter: MarkerFilter;
  topics?: TranscriptTopic[];
  onSearchChange: (v: string) => void;
  onFilterChange: (m: MarkerFilter) => void;
  onPlay?: (offsetSec: number) => void;
  onJumpToSlide?: (idx: number) => void;
  onAddMarker?: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window === "undefined") return "flat";
    return (window.localStorage.getItem("lumio.transcript.view") as ViewMode) || "flat";
  });
  // Capítulos abertos: inicialmente todos abertos. Map<id, bool>.
  const [openChapters, setOpenChapters] = useState<Record<string, boolean>>({});

  function setViewModePersisted(v: ViewMode) {
    setViewMode(v);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("lumio.transcript.view", v);
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter((e) => {
      if (activeFilter !== "all" && e.marker !== activeFilter) return false;
      if (q && !e.text.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [entries, search, activeFilter]);

  const chapters = useMemo(
    () => groupIntoChapters(filtered, topics),
    [filtered, topics],
  );

  // Quando capítulos mudam, abre o primeiro por default; os outros respeitam estado salvo
  useEffect(() => {
    if (viewMode !== "chapters" || chapters.length === 0) return;
    setOpenChapters((prev) => {
      const next = { ...prev };
      if (next[chapters[0].id] === undefined) next[chapters[0].id] = true;
      return next;
    });
  }, [chapters, viewMode]);

  useEffect(() => {
    if (scrollRef.current && isLive && viewMode === "flat") {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries.length, interim, isLive, viewMode]);

  const lastEntryId = entries[entries.length - 1]?.id;

  return (
    <div className="flex flex-col rounded-2xl border border-border/60 bg-card overflow-hidden">
      <div className="px-5 pt-5 pb-3 border-b border-border/60">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1 rounded-lg bg-secondary/60 p-1">
            <button
              onClick={() => setViewModePersisted("flat")}
              className={cn(
                "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                viewMode === "flat"
                  ? "bg-background shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Transcrição
            </button>
            <button
              onClick={() => setViewModePersisted("chapters")}
              className={cn(
                "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                viewMode === "chapters"
                  ? "bg-background shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Capítulos
              {chapters.length > 0 && (
                <span className="ml-1.5 text-[9px] text-muted-foreground">
                  {chapters.length}
                </span>
              )}
            </button>
          </div>
          {isLive && (
            <span className="inline-flex items-center gap-1.5 text-[10px] text-rose-600 dark:text-rose-400 font-medium">
              <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-pulse" />
              GRAVANDO
            </span>
          )}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Buscar na transcrição..."
              className="h-9 pl-8 pr-12 text-sm"
            />
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-mono text-muted-foreground/60 border border-border/60 rounded px-1.5 py-0.5">
              ⌘F
            </span>
          </div>
          <Button variant="outline" size="sm" className="h-9 gap-1.5">
            <Filter className="h-3.5 w-3.5" /> Filtros
          </Button>
        </div>
        <div className="mt-3 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={() => onFilterChange("all")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-medium transition-colors",
                activeFilter === "all"
                  ? "bg-foreground text-background"
                  : "bg-muted/50 text-muted-foreground hover:bg-muted",
              )}
            >
              Todos
            </button>
            {FILTERS.map((f) => (
              <button
                key={f.id}
                onClick={() => onFilterChange(activeFilter === f.id ? "all" : f.id)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-medium transition-colors",
                  activeFilter === f.id
                    ? "bg-foreground text-background"
                    : "bg-muted/50 text-muted-foreground hover:bg-muted",
                )}
              >
                <span className={cn("h-1.5 w-1.5 rounded-full", f.dot)} />
                {f.label}
              </button>
            ))}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 text-xs"
            onClick={onAddMarker}
          >
            <Bookmark className="h-3 w-3" /> Adicionar marcador
          </Button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-3 scrollbar-thin min-h-[420px]"
      >
        {filtered.length === 0 && !interim ? (
          <div className="h-full flex flex-col items-center justify-center text-center py-16 px-6">
            <div className="h-12 w-12 rounded-2xl bg-violet-500/10 flex items-center justify-center mb-3">
              <Sparkles className="h-5 w-5 text-violet-500" />
            </div>
            <p className="text-sm font-semibold">
              {isLive ? "Ouvindo..." : "Pronto pra começar"}
            </p>
            <p className="mt-1.5 text-xs text-muted-foreground max-w-xs">
              {isLive
                ? "As frases aparecem aqui assim que reconhecermos as primeiras palavras."
                : 'Clique em "Iniciar gravação" no topo pra começar a transcrever.'}
            </p>
          </div>
        ) : viewMode === "chapters" ? (
          <div className="space-y-2">
            {chapters.map((ch, i) => {
              const open = openChapters[ch.id] ?? false;
              const number = String(i + 1).padStart(2, "0");
              return (
                <div
                  key={ch.id}
                  className="rounded-xl border border-border/60 bg-card overflow-hidden"
                >
                  <div className="flex items-center gap-2 px-3 py-2.5">
                    <button
                      onClick={() =>
                        setOpenChapters((p) => ({ ...p, [ch.id]: !open }))
                      }
                      aria-expanded={open}
                      className="flex flex-1 items-center gap-2 text-left min-w-0"
                    >
                      <ChevronDown
                        className={cn(
                          "h-3.5 w-3.5 text-muted-foreground transition-transform shrink-0",
                          open && "rotate-0",
                          !open && "-rotate-90",
                        )}
                      />
                      <span className="font-mono text-[11px] text-muted-foreground/80 tabular-nums shrink-0">
                        {number}
                      </span>
                      <span className="text-sm font-semibold truncate">
                        {ch.title}
                      </span>
                      <span className="font-mono text-[10px] text-muted-foreground tabular-nums shrink-0">
                        {formatTs(ch.startSec)}
                      </span>
                    </button>
                    {hasAudio && onPlay && (
                      <button
                        onClick={() => onPlay(ch.startSec)}
                        className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-background px-2 py-1 text-[10px] font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
                      >
                        <Play className="h-2.5 w-2.5 fill-current" />
                        Ir para {formatTs(ch.startSec)}
                      </button>
                    )}
                  </div>
                  {open && (
                    <div className="border-t border-border/60 p-2 space-y-1 bg-background/40">
                      {ch.entries.map((e) => (
                        <TranscriptEntryRow
                          key={e.id}
                          entry={e}
                          isActive={e.id === lastEntryId && isLive}
                          keyTerms={keyTerms}
                          hasAudio={hasAudio}
                          onPlay={onPlay}
                          onJumpToSlide={onJumpToSlide}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="space-y-1">
            {filtered.map((e) => (
              <TranscriptEntryRow
                key={e.id}
                entry={e}
                isActive={e.id === lastEntryId && isLive}
                keyTerms={keyTerms}
                hasAudio={hasAudio}
                onPlay={onPlay}
                onJumpToSlide={onJumpToSlide}
              />
            ))}
            {interim && (
              <div className="px-3 py-2 text-sm text-muted-foreground italic">
                {interim}
                <span className="inline-block ml-1 h-3.5 w-0.5 bg-primary align-middle animate-pulse" />
              </div>
            )}
          </div>
        )}
      </div>

      <div className="border-t border-border/60 px-5 py-2.5 text-[11px] text-muted-foreground flex items-center justify-between bg-card">
        <span className="inline-flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
          Transcrição automática ativa
        </span>
        <span>Idioma: Português (Brasil)</span>
      </div>
    </div>
  );
}
