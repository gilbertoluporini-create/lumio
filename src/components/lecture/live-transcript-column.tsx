"use client";

import { useMemo, useRef, useEffect, useState } from "react";
import { Bookmark, ChevronDown, Expand, Filter, Loader2, Play, Search, Sparkles, Wand2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type {
  LectureSummary,
  TranscriptEntry,
  TranscriptMarker,
  TranscriptRevisedChapter,
  TranscriptTopic,
} from "@/lib/types";

type MarkerFilter = TranscriptMarker | "all";
type ViewMode = "flat" | "chapters" | "summary";

const FILTERS: { id: MarkerFilter; label: string; dot: string }[] = [
  { id: "concept", label: "Conceitos-chave", dot: "bg-violet-500" },
  { id: "doubt", label: "Dúvidas", dot: "bg-amber-500" },
  { id: "example", label: "Exemplos", dot: "bg-emerald-500" },
];

const CHUNK_FALLBACK_SEC = 600; // 10 min por capítulo sintético quando não há topics
const RAW_PARAGRAPH_SEC = 60; // 1 min por parágrafo na vista "Transcrição crua"
const CHAPTER_PARAGRAPH_SEC = 120; // 2 min por parágrafo dentro de cada capítulo

type RawParagraph = {
  startSec: number;
  text: string;
};

function groupIntoParagraphs(
  entries: TranscriptEntry[],
  windowSec: number,
): RawParagraph[] {
  if (entries.length === 0) return [];
  const groups: RawParagraph[] = [];
  let bucket: TranscriptEntry[] = [];
  let bucketStart = entries[0].startSec;
  const flush = () => {
    if (bucket.length === 0) return;
    groups.push({
      startSec: bucketStart,
      text: bucket.map((e) => e.text).join(" ").replace(/\s+/g, " ").trim(),
    });
    bucket = [];
  };
  for (const e of entries) {
    if (bucket.length === 0) {
      bucketStart = e.startSec;
      bucket.push(e);
      continue;
    }
    if (e.startSec - bucketStart >= windowSec) {
      flush();
      bucketStart = e.startSec;
    }
    bucket.push(e);
  }
  flush();
  return groups;
}

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
  revisedChapters,
  structuring,
  onStructureRequest,
  summary,
  generatingSummary,
  onGenerateSummary,
  onOpenSummaryFull,
  summaryEducational,
  generatingEducational,
  onGenerateEducational,
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
  revisedChapters?: TranscriptRevisedChapter[];
  structuring?: boolean;
  onStructureRequest?: () => void;
  summary?: LectureSummary;
  generatingSummary?: boolean;
  onGenerateSummary?: () => void;
  onOpenSummaryFull?: () => void;
  summaryEducational?: { markdown: string; generatedAt: string };
  generatingEducational?: boolean;
  onGenerateEducational?: () => void;
  onSearchChange: (v: string) => void;
  onFilterChange: (m: MarkerFilter) => void;
  onPlay?: (offsetSec: number) => void;
  onJumpToSlide?: (idx: number) => void;
  onAddMarker?: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  // Default sempre "chapters" (revisada). Usuário pode alternar pra "flat" (crua).
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window === "undefined") return "chapters";
    const saved = window.localStorage.getItem("lumio.transcript.view") as ViewMode | null;
    return saved || "chapters";
  });
  // Capítulos abertos: inicialmente todos abertos. Map<id, bool>.
  const [openChapters, setOpenChapters] = useState<Record<string, boolean>>({});
  // Paginação no modo flat — evita renderizar 1k+ entries de uma vez
  const FLAT_PAGE = 80;
  const [flatLimit, setFlatLimit] = useState<number>(FLAT_PAGE);

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

  // Reset paginação quando filtros mudam
  useEffect(() => {
    setFlatLimit(FLAT_PAGE);
  }, [search, activeFilter, viewMode]);

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


  return (
    <div className="flex flex-col rounded-2xl border border-border/60 bg-card overflow-hidden">
      <div className="px-5 pt-5 pb-3 border-b border-border/60">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1 rounded-lg bg-secondary/60 p-1">
            <button
              onClick={() => setViewModePersisted("chapters")}
              className={cn(
                "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                viewMode === "chapters"
                  ? "bg-background shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Transcrição revisada
              {chapters.length > 0 && (
                <span className="ml-1.5 text-[9px] text-muted-foreground">
                  {chapters.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setViewModePersisted("flat")}
              className={cn(
                "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                viewMode === "flat"
                  ? "bg-background shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Transcrição crua
            </button>
            <button
              onClick={() => setViewModePersisted("summary")}
              className={cn(
                "rounded-md px-3 py-1 text-xs font-medium transition-colors inline-flex items-center gap-1",
                viewMode === "summary"
                  ? "bg-background shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Sparkles className="h-3 w-3" />
              Resumo
            </button>
          </div>
          {isLive && (
            <span className="inline-flex items-center gap-1.5 text-[10px] text-rose-600 dark:text-rose-400 font-medium">
              <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-pulse" />
              GRAVANDO
            </span>
          )}
        </div>
        {viewMode !== "summary" && (
          <>
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
          </>
        )}
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-3 scrollbar-thin min-h-[420px]"
      >
        {viewMode === "summary" ? (
          <SummaryInlineView
            summary={summary}
            generating={!!generatingSummary}
            onGenerate={onGenerateSummary}
            educational={summaryEducational}
            generatingEducational={!!generatingEducational}
            onGenerateEducational={onGenerateEducational}
            hasEntries={entries.length > 0}
            onOpenFull={onOpenSummaryFull}
          />
        ) : filtered.length === 0 && !interim ? (
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
          <div className="space-y-3">
            {/* Banner: revisão por IA */}
            {revisedChapters && revisedChapters.length > 0 ? (
              <div className="flex items-center justify-between gap-2 rounded-lg border border-violet-500/30 bg-violet-500/5 px-3 py-2 text-[11px]">
                <span className="inline-flex items-center gap-1.5 text-violet-700 dark:text-violet-300">
                  <Wand2 className="h-3 w-3" />
                  Revisada e separada por IA
                </span>
                {onStructureRequest && (
                  <button
                    onClick={onStructureRequest}
                    disabled={structuring}
                    className="text-[10px] text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                  >
                    {structuring ? "Regerando..." : "Regerar (5 coins)"}
                  </button>
                )}
              </div>
            ) : onStructureRequest ? (
              <div className="rounded-lg border border-dashed border-violet-500/40 bg-violet-500/5 p-3">
                <div className="flex items-start gap-2.5">
                  <div className="h-7 w-7 shrink-0 rounded-md bg-violet-500/15 flex items-center justify-center">
                    <Wand2 className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold">
                      Quer capítulos com títulos reais?
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                      A IA revisa typos, ajusta pontuação e separa em capítulos
                      por tópico — não por janela de tempo.
                    </p>
                    <Button
                      onClick={onStructureRequest}
                      disabled={structuring || entries.length === 0}
                      size="sm"
                      className="mt-2 h-7 gap-1.5 text-[11px]"
                    >
                      {structuring ? (
                        <>
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Revisando...
                        </>
                      ) : (
                        <>
                          <Wand2 className="h-3 w-3" />
                          Revisar com IA (5 coins)
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            ) : null}

            {/* Lista de capítulos: revisados (IA) ou sintéticos (fallback) */}
            <div className="space-y-2">
              {(revisedChapters && revisedChapters.length > 0
                ? revisedChapters.map((rc, i) => ({
                    id: rc.id,
                    title: rc.title,
                    startSec: rc.startSec,
                    summary: rc.summary,
                    number: String(i + 1).padStart(2, "0"),
                    paragraphs: rc.paragraphs,
                  }))
                : chapters.map((ch, i) => ({
                    id: ch.id,
                    title: ch.title,
                    startSec: ch.startSec,
                    summary: undefined as string | undefined,
                    number: String(i + 1).padStart(2, "0"),
                    paragraphs: groupIntoParagraphs(
                      ch.entries,
                      CHAPTER_PARAGRAPH_SEC,
                    ),
                  }))
              ).map((ch) => {
                const open = openChapters[ch.id] ?? false;
                return (
                  <div
                    key={ch.id}
                    className="rounded-xl border border-border/60 bg-card overflow-hidden"
                  >
                    <div className="flex items-start gap-2 px-3 py-2.5">
                      <button
                        onClick={() =>
                          setOpenChapters((p) => ({ ...p, [ch.id]: !open }))
                        }
                        aria-expanded={open}
                        className="flex flex-1 items-start gap-2 text-left min-w-0"
                      >
                        <ChevronDown
                          className={cn(
                            "h-3.5 w-3.5 text-muted-foreground transition-transform shrink-0 mt-0.5",
                            open && "rotate-0",
                            !open && "-rotate-90",
                          )}
                        />
                        <span className="font-mono text-[11px] text-muted-foreground/80 tabular-nums shrink-0 mt-0.5">
                          {ch.number}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold truncate">
                              {ch.title}
                            </span>
                            <span className="font-mono text-[10px] text-muted-foreground tabular-nums shrink-0">
                              {formatTs(ch.startSec)}
                            </span>
                          </div>
                          {ch.summary && (
                            <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">
                              {ch.summary}
                            </p>
                          )}
                        </div>
                      </button>
                      {hasAudio && onPlay && (
                        <button
                          onClick={() => onPlay(ch.startSec)}
                          className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-background px-2 py-1 text-[10px] font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors shrink-0"
                        >
                          <Play className="h-2.5 w-2.5 fill-current" />
                          {formatTs(ch.startSec)}
                        </button>
                      )}
                    </div>
                    {open && (
                      <div className="border-t border-border/60 px-4 py-4 space-y-4 bg-background/40">
                        {ch.paragraphs.map((p) => (
                          <div key={p.startSec} className="flex gap-3">
                            <button
                              onClick={() => onPlay?.(p.startSec)}
                              disabled={!hasAudio || !onPlay}
                              className={cn(
                                "shrink-0 font-mono text-[11px] tabular-nums pt-0.5",
                                hasAudio && onPlay
                                  ? "text-muted-foreground hover:text-primary transition-colors cursor-pointer"
                                  : "text-muted-foreground/60 cursor-default",
                              )}
                              aria-label={hasAudio ? "Tocar a partir daqui" : undefined}
                            >
                              {formatTs(p.startSec)}
                            </button>
                            <p className="text-sm leading-relaxed text-foreground/90 min-w-0">
                              {p.text}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="px-2 py-1">
            {(() => {
              // Modo "Transcrição crua": modo leitura — parágrafos por minuto,
              // timestamp clicável no início, sem speaker/markers/highlights.
              // Pra aulas longas, pagina por parágrafos (não por entries).
              const paragraphs = groupIntoParagraphs(filtered, RAW_PARAGRAPH_SEC);
              const PAR_PAGE = 30;
              const sliced =
                isLive || paragraphs.length <= flatLimit
                  ? paragraphs
                  : paragraphs.slice(0, Math.max(PAR_PAGE, Math.floor(flatLimit / 4)));
              const remaining = paragraphs.length - sliced.length;
              return (
                <>
                  <div className="space-y-4">
                    {sliced.map((p) => (
                      <div key={p.startSec} className="flex gap-3">
                        <button
                          onClick={() => onPlay?.(p.startSec)}
                          disabled={!hasAudio || !onPlay}
                          className={cn(
                            "shrink-0 font-mono text-[11px] tabular-nums pt-0.5",
                            hasAudio && onPlay
                              ? "text-muted-foreground hover:text-primary transition-colors cursor-pointer"
                              : "text-muted-foreground/60 cursor-default",
                          )}
                          aria-label={hasAudio ? "Tocar a partir daqui" : undefined}
                        >
                          {formatTs(p.startSec)}
                        </button>
                        <p className="text-sm leading-relaxed text-foreground/90 min-w-0">
                          {p.text}
                        </p>
                      </div>
                    ))}
                  </div>
                  {remaining > 0 && (
                    <button
                      onClick={() => setFlatLimit((n) => n + PAR_PAGE * 4)}
                      className="w-full mt-4 rounded-md border border-dashed border-border/60 bg-card/40 px-3 py-2.5 text-xs font-medium text-muted-foreground hover:bg-secondary/40 hover:text-foreground transition-colors"
                    >
                      Mostrar mais {Math.min(remaining, PAR_PAGE * 4)} de {remaining} parágrafos restantes
                    </button>
                  )}
                </>
              );
            })()}
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

type SummaryFormat = "topics" | "educational";

function SummaryInlineView({
  summary,
  generating,
  onGenerate,
  educational,
  generatingEducational,
  onGenerateEducational,
  hasEntries,
  onOpenFull,
}: {
  summary?: LectureSummary;
  generating: boolean;
  onGenerate?: () => void;
  educational?: { markdown: string; generatedAt: string };
  generatingEducational: boolean;
  onGenerateEducational?: () => void;
  hasEntries: boolean;
  onOpenFull?: () => void;
}) {
  // Sub-tab default: se há educational, mostra ele; senão por tópicos
  const initialFormat: SummaryFormat = educational
    ? "educational"
    : summary
      ? "topics"
      : "educational";
  const [format, setFormat] = useState<SummaryFormat>(initialFormat);

  // Sincroniza quando recém-gerado um dos dois
  useEffect(() => {
    if (educational && !summary) setFormat("educational");
    else if (summary && !educational) setFormat("topics");
  }, [educational, summary]);

  return (
    <div className="space-y-4 px-1 py-1">
      {/* Toggle entre os dois formatos */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1 rounded-lg bg-secondary/60 p-1">
          <button
            onClick={() => setFormat("educational")}
            className={cn(
              "rounded-md px-3 py-1 text-xs font-medium transition-colors",
              format === "educational"
                ? "bg-background shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Educativo
            {educational && (
              <span className="ml-1 text-violet-500">•</span>
            )}
          </button>
          <button
            onClick={() => setFormat("topics")}
            className={cn(
              "rounded-md px-3 py-1 text-xs font-medium transition-colors",
              format === "topics"
                ? "bg-background shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Por tópicos
            {summary && (
              <span className="ml-1 text-violet-500">•</span>
            )}
          </button>
        </div>
        {onOpenFull && (educational || summary) && (
          <Button
            onClick={onOpenFull}
            variant="outline"
            size="sm"
            className="h-7 gap-1 text-[11px]"
          >
            <Expand className="h-3 w-3" />
            Abrir em tela cheia
          </Button>
        )}
      </div>

      {format === "educational" ? (
        <EducationalSummaryPane
          markdown={educational?.markdown}
          generating={generatingEducational}
          hasEntries={hasEntries}
          onGenerate={onGenerateEducational}
        />
      ) : (
        <TopicsSummaryPane
          summary={summary}
          generating={generating}
          hasEntries={hasEntries}
          onGenerate={onGenerate}
        />
      )}
    </div>
  );
}

function EducationalSummaryPane({
  markdown,
  generating,
  hasEntries,
  onGenerate,
}: {
  markdown?: string;
  generating: boolean;
  hasEntries: boolean;
  onGenerate?: () => void;
}) {
  if (!markdown) {
    return (
      <div className="rounded-xl border border-dashed border-violet-500/40 bg-violet-500/5 p-5">
        <div className="flex items-start gap-3">
          <div className="h-9 w-9 shrink-0 rounded-lg bg-violet-500/15 flex items-center justify-center">
            <Sparkles className="h-4 w-4 text-violet-600 dark:text-violet-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">Resumo educativo</p>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              Um artigo completo da aula no padrão da aba <strong>Resumos</strong> —
              estruturado em seções, com aprofundamento dos conceitos, exemplos
              clínicos e imagens ilustrativas geradas pela IA.
            </p>
            <Button
              onClick={onGenerate}
              disabled={!hasEntries || generating || !onGenerate}
              variant="gradient"
              size="sm"
              className="mt-3 gap-1.5"
            >
              {generating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Gerando (pode levar 1-2 min)...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Gerar resumo educativo (12 coins)
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <span className="inline-flex items-center gap-1.5 text-violet-700 dark:text-violet-300">
          <Sparkles className="h-3 w-3" />
          Resumo educativo
        </span>
        {onGenerate && (
          <button
            onClick={onGenerate}
            disabled={generating}
            className="text-[10px] text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            {generating ? "Regerando..." : "Regerar (12 coins)"}
          </button>
        )}
      </div>
      <article className="prose prose-sm dark:prose-invert max-w-none rounded-xl border border-border/60 bg-background/40 p-5 leading-relaxed">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
      </article>
    </div>
  );
}

function TopicsSummaryPane({
  summary,
  generating,
  hasEntries,
  onGenerate,
}: {
  summary?: LectureSummary;
  generating: boolean;
  hasEntries: boolean;
  onGenerate?: () => void;
}) {
  if (!summary) {
    return (
      <div className="rounded-xl border border-dashed border-border/60 bg-card/40 p-5">
        <div className="flex items-start gap-3">
          <div className="h-9 w-9 shrink-0 rounded-lg bg-secondary flex items-center justify-center">
            <Sparkles className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">Resumo por tópicos</p>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              Resumo estruturado por slide/bloco lógico — síntese geral, pontos
              centrais em bullets e detalhamento por tópico com Q&A relacionadas
              do chat.
            </p>
            <Button
              onClick={onGenerate}
              disabled={!hasEntries || generating || !onGenerate}
              variant="outline"
              size="sm"
              className="mt-3 gap-1.5"
            >
              {generating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Gerando...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Gerar resumo por tópicos (10 coins)
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
          <Sparkles className="h-3 w-3" />
          Resumo por tópicos
        </span>
        {onGenerate && (
          <button
            onClick={onGenerate}
            disabled={generating}
            className="text-[10px] text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            {generating ? "Regerando..." : "Regerar (10 coins)"}
          </button>
        )}
      </div>

      {summary.generalSummary && (
        <div className="rounded-xl border border-border/60 bg-background/40 p-4">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">
            Síntese
          </p>
          <div className="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {summary.generalSummary}
            </ReactMarkdown>
          </div>
        </div>
      )}

      {summary.highlights && summary.highlights.length > 0 && (
        <div className="rounded-xl border border-border/60 bg-background/40 p-4">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">
            Pontos centrais
          </p>
          <ul className="space-y-1.5">
            {summary.highlights.map((h, i) => (
              <li
                key={i}
                className="text-sm leading-relaxed flex gap-2 text-foreground/90"
              >
                <span className="text-violet-500 shrink-0">•</span>
                <span className="min-w-0">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      p: ({ children }) => <span>{children}</span>,
                    }}
                  >
                    {h}
                  </ReactMarkdown>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {summary.sections && summary.sections.length > 0 && (
        <div className="space-y-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
            Por slide / tópico
          </p>
          {summary.sections.map((s, i) => (
            <div
              key={i}
              className="rounded-xl border border-border/60 bg-card p-4"
            >
              <p className="text-sm font-semibold mb-2">
                {s.slideNumber ? `${s.slideNumber}. ` : ""}
                {s.slideTitle || `Bloco ${i + 1}`}
              </p>
              <div className="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed text-foreground/90">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {s.spokenContent}
                </ReactMarkdown>
              </div>
              {s.relatedQA && s.relatedQA.length > 0 && (
                <div className="mt-3 pt-3 border-t border-border/40 space-y-2">
                  {s.relatedQA.map((qa, j) => (
                    <div
                      key={j}
                      className="text-xs space-y-1 rounded-md bg-secondary/40 p-2"
                    >
                      <p className="font-semibold text-foreground/80">
                        Q: {qa.question}
                      </p>
                      <p className="text-muted-foreground">A: {qa.answer}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {summary.images && summary.images.length > 0 && (
        <div className="space-y-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
            Imagens geradas
          </p>
          <div className="grid grid-cols-2 gap-2">
            {summary.images.map((img, i) => (
              <img
                key={i}
                src={img.url}
                alt={img.alt ?? `Imagem ${i + 1}`}
                className="rounded-lg border border-border/60 w-full h-auto"
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
