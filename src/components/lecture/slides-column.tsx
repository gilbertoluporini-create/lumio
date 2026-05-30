"use client";

import { useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Hand,
  Highlighter,
  Info,
  Loader2,
  Maximize2,
  MessageSquare,
  MousePointer2,
  Paperclip,
  Pencil,
  Shapes,
  Trash2,
  Type as TypeIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { Slide } from "@/lib/types";

const TOOLS = [
  { id: "select", icon: MousePointer2, label: "Selecionar" },
  { id: "pan", icon: Hand, label: "Mover" },
  { id: "text", icon: TypeIcon, label: "Texto" },
  { id: "draw", icon: Pencil, label: "Lápis" },
  { id: "highlight", icon: Highlighter, label: "Realçar" },
  { id: "shape", icon: Shapes, label: "Forma" },
  { id: "comment", icon: MessageSquare, label: "Comentário" },
] as const;

type ToolId = (typeof TOOLS)[number]["id"];

export function SlidesColumn({
  slides,
  attaching,
  showPdfBesides,
  onTogglePdfBesides,
  currentIdx,
  onSelect,
  onAttachClick,
  onRemove,
  syncedSlideIdx,
}: {
  slides: Slide[] | undefined;
  attaching: boolean;
  showPdfBesides: boolean;
  onTogglePdfBesides: (v: boolean) => void;
  currentIdx: number;
  onSelect: (idx: number) => void;
  onAttachClick: () => void;
  onRemove: () => void;
  syncedSlideIdx?: number;
}) {
  const [zoom, setZoom] = useState(100);
  const [tool, setTool] = useState<ToolId>("select");
  const hasSlides = !!slides && slides.length > 0;
  const safeIdx = hasSlides
    ? Math.min(Math.max(currentIdx, 0), slides!.length - 1)
    : 0;
  const current = hasSlides ? slides![safeIdx] : null;

  return (
    <div className="flex flex-col rounded-2xl border border-border/60 bg-card overflow-hidden h-[640px] lg:h-[680px]">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-border/60 flex-wrap">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">Slides da aula</h3>
          {hasSlides && (
            <button
              title="A transcrição é sincronizada automaticamente com o slide atual no momento da fala."
              className="text-muted-foreground hover:text-foreground"
            >
              <Info className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-3">
          <label className="inline-flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
            <Switch
              checked={showPdfBesides}
              onCheckedChange={onTogglePdfBesides}
              label="Mostrar PDF ao lado"
            />
            Mostrar PDF ao lado
          </label>
          {hasSlides && (
            <span className="inline-flex items-center gap-1.5 text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Sincronização ativa
            </span>
          )}
        </div>
      </div>

      {!hasSlides ? (
        <SlidesEmpty
          attaching={attaching}
          onAttach={onAttachClick}
        />
      ) : (
        <>
          {/* Toolbar */}
          <div className="flex items-center justify-between gap-3 px-3 py-2 border-b border-border/60 bg-card/40">
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => onSelect(Math.max(0, safeIdx - 1))}
                disabled={safeIdx === 0}
                aria-label="Slide anterior"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="inline-flex items-center gap-1 text-xs font-mono">
                <input
                  type="number"
                  min={1}
                  max={slides!.length}
                  value={safeIdx + 1}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (Number.isFinite(n))
                      onSelect(Math.min(Math.max(n - 1, 0), slides!.length - 1));
                  }}
                  className="h-7 w-12 rounded-md border border-border/60 bg-background text-center"
                />
                <span className="text-muted-foreground">/ {slides!.length}</span>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => onSelect(Math.min(slides!.length - 1, safeIdx + 1))}
                disabled={safeIdx === slides!.length - 1}
                aria-label="Próximo slide"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setZoom((z) => Math.max(50, z - 10))}
              >
                <span className="text-sm font-semibold">−</span>
              </Button>
              <span className="text-xs font-mono w-12 text-center text-muted-foreground">
                {zoom}%
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setZoom((z) => Math.min(200, z + 10))}
              >
                <span className="text-sm font-semibold">+</span>
              </Button>
              <Button variant="ghost" size="icon-sm" aria-label="Fullscreen">
                <Maximize2 className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Download"
                title="Download"
              >
                <Download className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={onRemove}
                className="text-muted-foreground hover:text-destructive"
                title="Remover slides"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {/* Body: sidebar thumbs + viewer */}
          <div className="flex-1 grid grid-cols-[80px_1fr] min-h-0">
            <SlideThumbnails
              slides={slides!}
              currentIdx={safeIdx}
              onSelect={onSelect}
              syncedSlideIdx={syncedSlideIdx}
            />
            <div className="relative bg-muted/30 flex items-center justify-center overflow-auto p-4">
              {current?.imageDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={current.imageDataUrl}
                  alt={`Slide ${current.pageNumber}`}
                  style={{ width: `${zoom}%`, maxWidth: "100%" }}
                  className="object-contain rounded-md shadow-lg ring-1 ring-border/40 bg-white"
                />
              ) : (
                <div className="text-sm text-muted-foreground">
                  Imagem indisponível
                </div>
              )}
              {/* Floating toolbox */}
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-0.5 rounded-full bg-background/95 backdrop-blur border border-border/60 shadow-lg p-1">
                {TOOLS.map((t) => {
                  const Icon = t.icon;
                  return (
                    <button
                      key={t.id}
                      onClick={() => setTool(t.id)}
                      title={t.label}
                      className={cn(
                        "h-8 w-8 rounded-full flex items-center justify-center transition-colors",
                        tool === t.id
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:bg-muted",
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Sync footer */}
          {typeof syncedSlideIdx === "number" && (
            <div className="border-t border-border/60 px-5 py-2 bg-emerald-500/5 text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Slide {syncedSlideIdx + 1} sincronizado com a transcrição
            </div>
          )}

          {(current?.title || current?.text) && (
            <div className="border-t border-border/60 px-5 py-2.5 bg-card/40 max-h-[100px] overflow-y-auto scrollbar-thin">
              {current?.title && (
                <div className="text-xs font-semibold mb-1">{current.title}</div>
              )}
              {current?.text && (
                <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-3">
                  {current.text}
                </p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SlideThumbnails({
  slides,
  currentIdx,
  onSelect,
  syncedSlideIdx,
}: {
  slides: Slide[];
  currentIdx: number;
  onSelect: (idx: number) => void;
  syncedSlideIdx?: number;
}) {
  return (
    <div className="border-r border-border/60 bg-card/40 overflow-y-auto scrollbar-thin p-2 space-y-1.5">
      {slides.map((s, idx) => (
        <button
          key={s.pageNumber}
          onClick={() => onSelect(idx)}
          className={cn(
            "block w-full rounded-md overflow-hidden border-2 transition-all relative",
            idx === currentIdx
              ? "border-primary ring-2 ring-primary/30"
              : "border-transparent hover:border-border opacity-80 hover:opacity-100",
          )}
          title={`Slide ${s.pageNumber}${s.title ? " — " + s.title : ""}`}
        >
          {s.imageDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={s.imageDataUrl}
              alt={`thumb ${s.pageNumber}`}
              className="w-full aspect-[4/3] object-cover bg-white"
            />
          ) : (
            <div className="w-full aspect-[4/3] bg-muted flex items-center justify-center text-[10px] text-muted-foreground">
              {s.pageNumber}
            </div>
          )}
          <span className="absolute top-0.5 left-0.5 text-[9px] font-mono bg-background/80 px-1 rounded">
            {s.pageNumber}
          </span>
          {syncedSlideIdx === idx && (
            <span className="absolute bottom-0.5 right-0.5 h-1.5 w-1.5 rounded-full bg-emerald-500" />
          )}
        </button>
      ))}
    </div>
  );
}

function SlidesEmpty({
  attaching,
  onAttach,
}: {
  attaching: boolean;
  onAttach: () => void;
}) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center min-h-[420px]">
      <div className="h-14 w-14 rounded-2xl bg-violet-500/10 flex items-center justify-center mb-3">
        <Paperclip className="h-6 w-6 text-violet-500" />
      </div>
      <h3 className="text-base font-semibold">
        {attaching ? "Lendo os slides..." : "Anexe os slides da aula"}
      </h3>
      <p className="mt-1.5 text-sm text-muted-foreground max-w-xs">
        {attaching
          ? "Processando PDF e extraindo o conteúdo de cada slide."
          : "Envie o PDF do professor pra sincronizar slide e transcrição."}
      </p>
      <Button
        variant="gradient"
        size="lg"
        className="mt-6"
        onClick={onAttach}
        disabled={attaching}
      >
        {attaching ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> Processando...
          </>
        ) : (
          <>
            <Paperclip className="h-4 w-4" /> Anexar PDF dos slides
          </>
        )}
      </Button>
      <p className="mt-3 text-[11px] text-muted-foreground/70">
        PDF até 50MB
      </p>
    </div>
  );
}
