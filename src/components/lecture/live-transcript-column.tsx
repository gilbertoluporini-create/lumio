"use client";

import { useMemo, useRef, useEffect } from "react";
import { Bookmark, Filter, Search, Sparkles } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { TranscriptEntry, TranscriptMarker } from "@/lib/types";
import { TranscriptEntryRow } from "./transcript-entry";

type MarkerFilter = TranscriptMarker | "all";

const FILTERS: { id: MarkerFilter; label: string; dot: string }[] = [
  { id: "concept", label: "Conceitos-chave", dot: "bg-violet-500" },
  { id: "doubt", label: "Dúvidas", dot: "bg-amber-500" },
  { id: "example", label: "Exemplos", dot: "bg-emerald-500" },
];

export function LiveTranscriptColumn({
  entries,
  interim,
  isLive,
  keyTerms,
  hasAudio,
  search,
  activeFilter,
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
  onSearchChange: (v: string) => void;
  onFilterChange: (m: MarkerFilter) => void;
  onPlay?: (offsetSec: number) => void;
  onJumpToSlide?: (idx: number) => void;
  onAddMarker?: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter((e) => {
      if (activeFilter !== "all" && e.marker !== activeFilter) return false;
      if (q && !e.text.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [entries, search, activeFilter]);

  useEffect(() => {
    if (scrollRef.current && isLive) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries.length, interim, isLive]);

  const lastEntryId = entries[entries.length - 1]?.id;

  return (
    <div className="flex flex-col rounded-2xl border border-border/60 bg-card overflow-hidden">
      <div className="px-5 pt-5 pb-3 border-b border-border/60">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold">Transcrição ao vivo</h3>
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
