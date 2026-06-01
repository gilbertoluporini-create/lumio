"use client";

import { useCallback, useMemo, useRef, useEffect, useState } from "react";
import { Bookmark, ChevronDown, Expand, FileText, Filter, Layers, Loader2, Play, Search, Sparkles, Wand2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ZoomableImage } from "@/components/ui/zoomable-image";
import { cn } from "@/lib/utils";
import { estimateChunkCount } from "@/lib/transcript-chunking";
import { COIN_COSTS } from "@/lib/coin-costs";
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

/**
 * Injeta as imagens do resumo (vindas com sectionIndex apontando pra um H2)
 * INLINE no markdown, logo após o cabeçalho da seção correspondente. Espelha
 * a lógica server-side de /api/ai/summary-images, mas roda no client pra
 * funcionar mesmo quando o markdown salvo no banco está sem as imagens
 * injetadas (race com geração assíncrona).
 */
function injectImagesIntoMarkdown(
  markdown: string,
  images: import("@/lib/types").LectureSummaryImage[],
): string {
  if (!images || images.length === 0) return markdown;

  // Idempotência: o summary-images server-side já injeta as imagens no
  // markdown salvo em summaries.content.generalSummary E em
  // lectures.summary_educational.markdown. Quando o client chama essa
  // função de novo (defesa em profundidade pro caso de race com geração
  // assíncrona), precisamos pular as imagens cuja URL JÁ está presente
  // — senão cada imagem aparece duplicada.
  const presentUrls = new Set<string>();
  const imgRe = /!\[[^\]]*\]\(([^)]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = imgRe.exec(markdown)) !== null) {
    presentUrls.add(m[1]);
  }
  const remainingImages = images.filter((img) => !presentUrls.has(img.url));
  if (remainingImages.length === 0) return markdown;

  const lines = markdown.split("\n");
  const h2Lines: number[] = [];
  lines.forEach((line, i) => {
    if (line.startsWith("## ")) h2Lines.push(i);
  });

  // Imagens vêm no FIM da seção (logo antes do próximo H2 ou fim do doc),
  // não logo após o cabeçalho. Assim aparecem DEPOIS do contexto.
  type Plan = { insertAt: number; img: import("@/lib/types").LectureSummaryImage };
  const plans: Plan[] = [];
  const used = new Set<number>();
  for (let i = 0; i < remainingImages.length; i++) {
    const img = remainingImages[i];
    if (typeof img.sectionIndex !== "number") continue;
    if (img.sectionIndex < 0 || img.sectionIndex >= h2Lines.length) continue;
    const nextH2 = h2Lines[img.sectionIndex + 1];
    const sectionEnd = nextH2 !== undefined ? nextH2 : lines.length;
    plans.push({ insertAt: sectionEnd, img });
    used.add(i);
  }
  plans.sort((a, b) => b.insertAt - a.insertAt);
  for (const p of plans) {
    const insertLines = [
      "",
      `![${p.img.alt || p.img.caption || "Ilustração"}](${p.img.url})`,
    ];
    if (p.img.caption) insertLines.push(`*${p.img.caption}*`);
    insertLines.push("");
    lines.splice(p.insertAt, 0, ...insertLines);
  }

  // Imagens sem sectionIndex válido: cai em galeria no final
  const leftovers = remainingImages.filter((_, i) => !used.has(i));
  if (leftovers.length > 0) {
    lines.push("", "---", "");
    for (const img of leftovers) {
      lines.push(
        `![${img.alt || img.caption || "Ilustração"}](${img.url})`,
        img.caption ? `*${img.caption}*` : "",
        "",
      );
    }
  }
  return lines.join("\n");
}

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
  slidesCount = 0,
  onSyncSlides,
  syncingSlides,
  summary,
  generatingSummary,
  onGenerateSummary,
  onOpenSummaryFull,
  summaryEducational,
  summaryImages,
  generatingEducational,
  onGenerateEducational,
  onSearchChange,
  onFilterChange,
  onPlay,
  onJumpToSlide,
  onAddMarker,
  initialViewMode,
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
  /** Quantidade de slides anexados — usada pra mostrar o botão de sincronia. */
  slidesCount?: number;
  /** Dispara sincronia IA capítulos↔slides (cobra 3 coins). */
  onSyncSlides?: () => void;
  syncingSlides?: boolean;
  summary?: LectureSummary;
  generatingSummary?: boolean;
  onGenerateSummary?: () => void;
  onOpenSummaryFull?: () => void;
  summaryEducational?: { markdown: string; generatedAt: string };
  summaryImages?: import("@/lib/types").LectureSummaryImage[];
  generatingEducational?: boolean;
  onGenerateEducational?: (crossPdfs: boolean, useAtlas: boolean) => void;
  onSearchChange: (v: string) => void;
  onFilterChange: (m: MarkerFilter) => void;
  onPlay?: (offsetSec: number) => void;
  onJumpToSlide?: (idx: number) => void;
  onAddMarker?: () => void;
  initialViewMode?: ViewMode;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  // Aula sem áudio/entries = nasceu de PDF/dashboard, não tem transcrição.
  // Nesse caso só faz sentido mostrar Resumo — escondemos as outras 2 tabs.
  const hasTranscriptContent = entries.length > 0 || hasAudio;

  // Default sempre "chapters" (revisada). Usuário pode alternar pra "flat" (crua).
  // initialViewMode (de ?tab=summary) tem prioridade sobre localStorage no primeiro mount.
  // Sem transcrição (PDF/dashboard), força "summary" — as tabs de transcrição
  // não aparecem e não faz sentido cair em "chapters" vazio.
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (!hasTranscriptContent) return "summary";
    if (initialViewMode) return initialViewMode;
    if (typeof window === "undefined") return "chapters";
    const saved = window.localStorage.getItem("lumio.transcript.view") as ViewMode | null;
    return saved || "chapters";
  });
  // Capítulos abertos: inicialmente todos abertos. Map<id, bool>.
  const [openChapters, setOpenChapters] = useState<Record<string, boolean>>({});
  // Paginação no modo flat — evita renderizar 1k+ entries de uma vez
  const FLAT_PAGE = 80;
  const [flatLimit, setFlatLimit] = useState<number>(FLAT_PAGE);

  // Timestamps de quando as ações de IA começaram — persistidos em
  // sessionStorage pra sobreviver a HMR (dev) e tab-switches. FakeProgress lê
  // pra calcular elapsed sem reiniciar quando o componente filho remonta.
  const structuringKey = "lumio.structuring.startedAt";
  const educationalKey = "lumio.educational.startedAt";
  const [structuringStartedAt, setStructuringStartedAt] = useState<number | null>(() => {
    if (typeof window === "undefined") return null;
    const v = window.sessionStorage.getItem(structuringKey);
    return v ? Number(v) : null;
  });
  const [educationalStartedAt, setEducationalStartedAt] = useState<number | null>(() => {
    if (typeof window === "undefined") return null;
    const v = window.sessionStorage.getItem(educationalKey);
    return v ? Number(v) : null;
  });

  useEffect(() => {
    if (structuring) {
      if (structuringStartedAt === null) {
        const t = Date.now();
        setStructuringStartedAt(t);
        window.sessionStorage.setItem(structuringKey, String(t));
      }
    } else if (structuringStartedAt !== null) {
      setStructuringStartedAt(null);
      window.sessionStorage.removeItem(structuringKey);
    }
  }, [structuring, structuringStartedAt]);

  useEffect(() => {
    if (generatingEducational) {
      if (educationalStartedAt === null) {
        const t = Date.now();
        setEducationalStartedAt(t);
        window.sessionStorage.setItem(educationalKey, String(t));
      }
    } else if (educationalStartedAt !== null) {
      setEducationalStartedAt(null);
      window.sessionStorage.removeItem(educationalKey);
    }
  }, [generatingEducational, educationalStartedAt]);

  // Quantos chunks a revisão IA vai gerar pra essa transcrição
  // (COIN_COSTS.transcript_structure por chunk). Aulas <25min = 1 chunk;
  // 1h+ vira 2-4 chunks.
  const aiChunkCount = useMemo(
    () => Math.max(1, estimateChunkCount(entries)),
    [entries],
  );
  const aiCoinCost = aiChunkCount * COIN_COSTS.transcript_structure;

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
    <div className="flex flex-col rounded-2xl border border-border/60 bg-card overflow-hidden h-[640px] lg:h-[720px]">
      <div className="px-5 pt-5 pb-3 border-b border-border/60">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1 rounded-lg bg-secondary/60 p-1">
            {hasTranscriptContent && (
              <>
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
              </>
            )}
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
        className="flex-1 overflow-y-auto p-3 scrollbar-thin min-h-0"
      >
        {viewMode === "summary" ? (
          <SummaryInlineView
            summary={summary}
            generating={!!generatingSummary}
            onGenerate={onGenerateSummary}
            educational={summaryEducational}
            educationalImages={summaryImages}
            generatingEducational={!!generatingEducational}
            educationalStartedAtMs={educationalStartedAt}
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
              <div className="space-y-2">
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
                      {structuring
                        ? "Regerando..."
                        : `Regerar (${aiCoinCost} coins)`}
                    </button>
                  )}
                </div>
                {/* Sincronizar capítulos ↔ slides do PDF anexado.
                    Aparece quando: tem slides E pelo menos 1 capítulo ainda
                    não foi correlacionado a um slide. Destacado em
                    gradient sky→violet pra puxar o olho do user. */}
                {slidesCount > 0 &&
                  onSyncSlides &&
                  revisedChapters.some((c) => typeof c.slideIndex !== "number") && (
                    <div className="relative overflow-hidden rounded-xl border border-sky-500/40 bg-gradient-to-br from-sky-500/10 via-violet-500/10 to-fuchsia-500/10 p-3.5">
                      <div className="flex items-start gap-3">
                        <div className="relative h-9 w-9 shrink-0 rounded-lg bg-gradient-to-br from-sky-500 to-violet-500 flex items-center justify-center shadow-sm">
                          <Layers className="h-4 w-4 text-white" />
                          {!syncingSlides && (
                            <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5">
                              <span className="absolute inset-0 rounded-full bg-fuchsia-400 animate-ping opacity-75" />
                              <span className="absolute inset-0 rounded-full bg-fuchsia-500" />
                            </span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-foreground">
                            Conectar capítulos aos {slidesCount} slides do PDF
                          </p>
                          <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                            A IA descobre qual slide cada capítulo cobre — fica
                            mais fácil pular pra parte certa da aula.
                          </p>
                          <div className="mt-2.5">
                            <Button
                              onClick={onSyncSlides}
                              disabled={syncingSlides}
                              size="sm"
                              variant="gradient"
                              className="h-7 gap-1.5 text-[11px]"
                            >
                              {syncingSlides ? (
                                <>
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                  Sincronizando...
                                </>
                              ) : (
                                <>
                                  <Sparkles className="h-3 w-3" />
                                  Sincronizar com IA (3 coins)
                                </>
                              )}
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
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
                      {topics.length > 0
                        ? "Texto cru com typos? Refine com IA."
                        : "Quer capítulos com títulos reais?"}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                      {topics.length > 0
                        ? "Os capítulos abaixo vêm da detecção automática durante a gravação. A IA corrige typos, ajusta pontuação e reescreve em parágrafos coerentes."
                        : "A IA revisa typos, ajusta pontuação e separa em capítulos por tópico — não por janela de tempo."}
                    </p>
                    {structuring ? (
                      <FakeProgress
                        // Chunks paralelos: tempo total ≈ tempo de 1 chunk
                        // (chunk de ~25min costuma levar 60-150s no Sonnet 4.5).
                        estimateSec={150}
                        label={
                          aiChunkCount > 1
                            ? `Revisando ${aiChunkCount} partes em paralelo`
                            : "Revisando com IA"
                        }
                        hint="Pode fechar a aba — continua rodando no servidor."
                        startedAtMs={structuringStartedAt ?? Date.now()}
                      />
                    ) : (
                      <div className="mt-2 flex items-center gap-2 flex-wrap">
                        <Button
                          onClick={onStructureRequest}
                          disabled={entries.length === 0}
                          size="sm"
                          className="h-7 gap-1.5 text-[11px]"
                        >
                          <Wand2 className="h-3 w-3" />
                          Revisar com IA ({aiCoinCost} coins)
                        </Button>
                        {aiChunkCount > 1 && (
                          <span className="text-[10px] text-muted-foreground">
                            Aula longa: {aiChunkCount} partes processadas em
                            paralelo
                          </span>
                        )}
                      </div>
                    )}
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
                    slideIndex: rc.slideIndex,
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
                    slideIndex: undefined as number | undefined,
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
                      {typeof ch.slideIndex === "number" && onJumpToSlide && (
                        <button
                          onClick={() => onJumpToSlide(ch.slideIndex as number)}
                          className="inline-flex items-center gap-1 rounded-md border border-sky-500/40 bg-sky-500/5 px-2 py-1 text-[10px] font-medium text-sky-700 dark:text-sky-300 hover:bg-sky-500/10 transition-colors shrink-0"
                        >
                          <FileText className="h-2.5 w-2.5" />
                          Slide {ch.slideIndex + 1}
                        </button>
                      )}
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

function SummaryInlineView({
  summary,
  educational,
  educationalImages,
  generatingEducational,
  educationalStartedAtMs,
  onGenerateEducational,
  hasEntries,
}: {
  // `summary` (LectureSummary) entra como fallback do markdown renderizado
  // quando NÃO existe educational — é o caso de resumo de PDF puro gerado
  // pelo wizard, onde `summary.generalSummary` já vem em markdown rico com
  // imagens inline.
  summary?: LectureSummary;
  generating?: boolean;
  onGenerate?: () => void;
  educational?: { markdown: string; generatedAt: string };
  educationalImages?: import("@/lib/types").LectureSummaryImage[];
  generatingEducational: boolean;
  educationalStartedAtMs?: number | null;
  onGenerateEducational?: (crossPdfs: boolean, useAtlas: boolean) => void;
  hasEntries: boolean;
  // Mantido por retrocompat — handler local de fullscreen real prevalece.
  onOpenFull?: () => void;
}) {
  // Fallback do markdown renderizado: educational tem prioridade (é o premium
  // gerado pelo botão "Gerar resumo educativo (18 coins)" na /lecture). Se não
  // existir mas tivermos summary.generalSummary (PDF puro via wizard), usamos
  // ele. Sem nenhum dos dois → card de oferta dentro do EducationalSummaryPane.
  const renderMarkdown = educational?.markdown ?? summary?.generalSummary ?? "";
  const renderImages = educationalImages ?? summary?.images;
  const hasRender = !!renderMarkdown;
  const summaryFullscreenRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const handleFullscreen = useCallback(async () => {
    const el = summaryFullscreenRef.current;
    if (!el) return;
    try {
      if (typeof document !== "undefined" && document.fullscreenElement) {
        await document.exitFullscreen();
        return;
      }
      const elWithWebkit = el as HTMLDivElement & {
        webkitRequestFullscreen?: () => Promise<void> | void;
      };
      if (typeof elWithWebkit.requestFullscreen === "function") {
        await elWithWebkit.requestFullscreen();
      } else if (typeof elWithWebkit.webkitRequestFullscreen === "function") {
        await elWithWebkit.webkitRequestFullscreen();
      }
    } catch (e) {
      console.warn("[fullscreen]", e);
    }
  }, []);

  useEffect(() => {
    const onChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  return (
    <div
      ref={summaryFullscreenRef}
      className={cn(
        "space-y-4 px-1 py-1",
        isFullscreen && "bg-background overflow-y-auto p-6 h-screen w-screen",
      )}
    >
      {/* Header com botão Abrir em tela cheia (fullscreen real). Aparece quando
          há algum markdown renderizado — educational OU summary base. */}
      {hasRender && (
        <div className="flex items-center justify-end">
          <Button
            onClick={handleFullscreen}
            variant="outline"
            size="sm"
            className="h-7 gap-1 text-[11px]"
          >
            <Expand className="h-3 w-3" />
            {isFullscreen ? "Sair da tela cheia" : "Abrir em tela cheia"}
          </Button>
        </div>
      )}
      <EducationalSummaryPane
        markdown={renderMarkdown || undefined}
        images={renderImages}
        generating={generatingEducational}
        startedAtMs={educationalStartedAtMs ?? null}
        hasEntries={hasEntries}
        onGenerate={onGenerateEducational}
      />
    </div>
  );
}

/**
 * Barra de progresso "fake" pra ações longas de IA — avança rapidamente até
 * ~70% e desacelera assintótico em direção a ~92% sem nunca chegar em 100%.
 *
 * `startedAtMs` vem do pai pra que o progresso não reinicie quando o usuário
 * muda de aba (chapters → flat → chapters) e o componente remonta — calcula
 * elapsed pelo timestamp original, não pelo mount.
 */
function FakeProgress({
  estimateSec,
  label,
  hint,
  startedAtMs,
}: {
  estimateSec: number;
  label: string;
  hint?: string;
  startedAtMs: number;
}) {
  const [progress, setProgress] = useState(2);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    function tick() {
      const seconds = Math.max(0, (Date.now() - startedAtMs) / 1000);
      setElapsed(seconds);
      const t = seconds / estimateSec;
      const eased = 1 - Math.exp(-1.6 * t);
      setProgress(Math.min(92, Math.round(eased * 100)));
    }
    tick();
    const id = window.setInterval(tick, 350);
    return () => window.clearInterval(id);
  }, [estimateSec, startedAtMs]);

  const mm = Math.floor(elapsed / 60);
  const ss = Math.floor(elapsed % 60);
  const elapsedLabel =
    mm > 0 ? `${mm}m${ss.toString().padStart(2, "0")}s` : `${ss}s`;

  return (
    <div className="mt-2 space-y-1.5">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-violet-500/15">
        <div
          className="h-full bg-gradient-to-r from-violet-500 to-fuchsia-500 transition-all duration-300 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="flex items-center justify-between gap-2 text-[10px]">
        <span className="inline-flex items-center gap-1 text-violet-700 dark:text-violet-300 font-medium">
          <Loader2 className="h-3 w-3 animate-spin" />
          {label}
        </span>
        <span className="font-mono text-muted-foreground tabular-nums">
          {progress}% · {elapsedLabel}
        </span>
      </div>
      {hint && (
        <p className="text-[10px] text-muted-foreground/80 leading-relaxed">
          {hint}
        </p>
      )}
    </div>
  );
}

function EducationalSummaryPane({
  markdown,
  images,
  generating,
  startedAtMs,
  hasEntries,
  onGenerate,
}: {
  markdown?: string;
  images?: import("@/lib/types").LectureSummaryImage[];
  generating: boolean;
  startedAtMs?: number | null;
  hasEntries: boolean;
  onGenerate?: (crossPdfs: boolean, useAtlas: boolean) => void;
}) {
  const [crossPdfs, setCrossPdfs] = useState(false);
  const [useAtlas, setUseAtlas] = useState(false);
  const baseCost = COIN_COSTS.summary_educational;
  const crossCost = COIN_COSTS.summary_educational_cross;
  const atlasCost = COIN_COSTS.summary_atlas;
  const finalCost = useAtlas ? atlasCost : crossPdfs ? crossCost : baseCost;
  const crossDelta = crossCost - baseCost;
  const atlasDelta = atlasCost - baseCost;
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
            {generating ? (
              <FakeProgress
                estimateSec={180}
                label="Gerando resumo educativo"
                hint="Pode levar 1-3 min pra aulas longas. Pode fechar a aba — continua rodando no servidor."
                startedAtMs={startedAtMs ?? Date.now()}
              />
            ) : (
              <div className="mt-3 space-y-2">
                <Button
                  onClick={() => onGenerate?.(crossPdfs, useAtlas)}
                  disabled={!hasEntries || !onGenerate}
                  variant="gradient"
                  size="sm"
                  className="gap-1.5"
                >
                  <Sparkles className="h-4 w-4" />
                  Gerar resumo educativo ({finalCost} coins)
                </Button>
                <label className="flex items-start gap-2 text-[11px] text-muted-foreground cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={crossPdfs}
                    disabled={useAtlas}
                    onChange={(e) => setCrossPdfs(e.target.checked)}
                    className="mt-0.5 h-3.5 w-3.5 rounded border-violet-500/40 text-violet-600 focus:ring-violet-500 disabled:opacity-40"
                  />
                  <span className="leading-snug">
                    Cruzar com meus PDFs da matéria{" "}
                    <span className="text-violet-600 dark:text-violet-400 font-medium">
                      (+{crossDelta}c)
                    </span>
                    <span className="block text-[10px] text-muted-foreground/70">
                      Lumi usa seus PDFs como material de apoio pra dar mais
                      profundidade ao resumo.
                    </span>
                  </span>
                </label>
                <label className="flex items-start gap-2 text-[11px] text-muted-foreground cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={useAtlas}
                    onChange={(e) => {
                      setUseAtlas(e.target.checked);
                      if (e.target.checked) setCrossPdfs(true);
                    }}
                    className="mt-0.5 h-3.5 w-3.5 rounded border-amber-500/40 text-amber-600 focus:ring-amber-500"
                  />
                  <span className="leading-snug">
                    Usar imagens dos meus atlas{" "}
                    <span className="text-amber-600 dark:text-amber-400 font-medium">
                      (+{atlasDelta}c)
                    </span>
                    <span className="block text-[10px] text-muted-foreground/70">
                      Lumi cruza com seus PDFs E injeta imagens REAIS (Netter,
                      Sobotta, exames) que casarem com o conteúdo da aula.
                      Anatomia certa em vez de IA. Funciona melhor com PDFs já
                      processados em <strong>/documentos</strong>.
                    </span>
                  </span>
                </label>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
        <span className="inline-flex items-center gap-1.5 text-violet-700 dark:text-violet-300">
          <Sparkles className="h-3 w-3" />
          Resumo educativo
        </span>
        {onGenerate && (
          <button
            onClick={() => onGenerate(false, false)}
            disabled={generating}
            className="text-[10px] text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            {generating
              ? "Regerando..."
              : `Regerar (${baseCost} coins)`}
          </button>
        )}
      </div>
      <article className="prose prose-sm dark:prose-invert max-w-none rounded-xl border border-border/60 bg-background/40 p-5 leading-relaxed prose-img:my-8">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            // Imagens viram <ZoomableImage> — clique abre lightbox em tela
            // grande pra leitura confortável dos detalhes. Espaçamento my-8
            // garante respiro entre imagem e texto adjacente.
            img: ({ src, alt }) => (
              <ZoomableImage
                src={typeof src === "string" ? src : ""}
                alt={alt ?? undefined}
              />
            ),
          }}
        >
          {injectImagesIntoMarkdown(markdown, images ?? [])}
        </ReactMarkdown>
      </article>
    </div>
  );
}

