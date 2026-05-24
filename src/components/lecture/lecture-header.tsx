"use client";

import { createElement, useState } from "react";
import Link from "next/link";
import {
  Check,
  ChevronLeft,
  Download,
  Mic,
  MoreHorizontal,
  Save,
  Share2,
  Sparkles,
  Square,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn, formatDuration } from "@/lib/utils";

export type LectureHeaderView = "live" | "summary" | "products";

export function LectureHeader({
  title,
  subjectName,
  subjectColor,
  professorName,
  isLive,
  durationSec,
  view,
  hasSummary,
  generatingSummary,
  productsHref,
  onTitleChange,
  onToggleRecording,
  onChangeView,
  onSave,
  onGenerateSummary,
  onShare,
  onExportPdf,
  onDelete,
  onBack,
}: {
  title: string;
  subjectName?: string;
  subjectColor?: string;
  professorName?: string;
  isLive: boolean;
  durationSec: number;
  view: LectureHeaderView;
  hasSummary: boolean;
  generatingSummary: boolean;
  productsHref: string;
  onTitleChange: (next: string) => void;
  onToggleRecording: () => void;
  onChangeView: (v: LectureHeaderView) => void;
  onSave: () => void;
  onGenerateSummary?: () => void;
  onShare: () => void;
  onExportPdf: () => void;
  onDelete: () => void;
  onBack: () => void;
}) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [draft, setDraft] = useState(title);

  function commitTitle() {
    const t = draft.trim();
    if (!t) {
      setDraft(title);
    } else if (t !== title) {
      onTitleChange(t);
    }
    setEditingTitle(false);
  }

  return (
    <div className="sticky top-0 z-30 bg-background/85 backdrop-blur border-b border-border/60 px-4 py-3">
      <div className="mx-auto max-w-[1600px] flex flex-col gap-3">
        <button
          onClick={onBack}
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 self-start"
        >
          <ChevronLeft className="h-3.5 w-3.5" /> Voltar
        </button>

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              {editingTitle ? (
                <div className="flex items-center gap-1.5">
                  <Input
                    autoFocus
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={commitTitle}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitTitle();
                      if (e.key === "Escape") {
                        setDraft(title);
                        setEditingTitle(false);
                      }
                    }}
                    className="text-xl font-semibold h-10 min-w-[280px]"
                  />
                  <Button variant="ghost" size="icon-sm" onClick={commitTitle}>
                    <Check className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : (
                <h1
                  className="text-xl md:text-2xl font-semibold tracking-tight cursor-text hover:bg-secondary/40 rounded-md px-2 -mx-2 py-0.5 transition-colors"
                  onClick={() => {
                    setDraft(title);
                    setEditingTitle(true);
                  }}
                  title="Clique pra renomear"
                >
                  {title}
                </h1>
              )}
              {isLive && (
                <Badge
                  variant="live"
                  className="gap-1.5 bg-rose-500 text-white border-transparent"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
                  AO VIVO
                </Badge>
              )}
              {durationSec > 0 && (
                <span className="font-mono text-xs text-muted-foreground tabular-nums">
                  {formatDurationLong(durationSec)}
                </span>
              )}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              {subjectName && (
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className={cn(
                      "h-2 w-2 rounded-full bg-gradient-to-br shrink-0",
                      subjectColor ?? "from-violet-500 to-fuchsia-500",
                    )}
                  />
                  {subjectName}
                </span>
              )}
              {professorName && (
                <span className="inline-flex items-center gap-1.5">
                  <UserDot icon={Mic} /> {professorName}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <div className="inline-flex rounded-md border border-border/70 bg-card p-0.5">
              {(
                [
                  { id: "live", label: "Aula" },
                  { id: "summary", label: "Resumo" },
                ] as const
              ).map((t) => (
                <button
                  key={t.id}
                  onClick={() => onChangeView(t.id)}
                  className={cn(
                    "px-3 py-1.5 text-xs font-medium rounded-sm transition-colors flex items-center gap-1.5",
                    view === t.id
                      ? "bg-secondary text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t.label}
                  {t.id === "summary" && hasSummary && (
                    <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                  )}
                </button>
              ))}
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="px-3 h-auto py-1.5 text-xs rounded-sm"
              >
                <Link href={productsHref}>Produtos</Link>
              </Button>
            </div>

            {view === "live" && (
              <Button variant="ghost" size="sm" onClick={onSave}>
                <Save className="h-4 w-4" /> Salvar
              </Button>
            )}
            {view === "summary" && onGenerateSummary && (
              <Button
                variant="gradient"
                size="sm"
                onClick={onGenerateSummary}
                disabled={generatingSummary}
              >
                <Sparkles className="h-4 w-4" />
                {hasSummary ? "Regenerar" : "Gerar resumo"}
              </Button>
            )}

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Mais opções"
                  className="text-muted-foreground"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={onShare}>
                  <Share2 className="h-4 w-4" /> Compartilhar
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onExportPdf}>
                  <Download className="h-4 w-4" /> Exportar PDF
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={onDelete}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="h-4 w-4" /> Excluir aula
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button
              size="sm"
              onClick={onToggleRecording}
              className={cn(
                "gap-1.5",
                isLive
                  ? "bg-rose-500 hover:bg-rose-600 text-white shadow-md shadow-rose-500/30"
                  : "bg-primary hover:bg-primary/90 text-primary-foreground",
              )}
            >
              {isLive ? (
                <>
                  <Square className="h-3.5 w-3.5 fill-current" /> Parar gravação
                </>
              ) : (
                <>
                  <Mic className="h-3.5 w-3.5" />{" "}
                  {durationSec > 0 ? "Continuar gravação" : "Iniciar gravação"}
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function UserDot({ icon }: { icon: LucideIcon }) {
  return (
    <span className="inline-flex h-3.5 w-3.5 items-center justify-center text-muted-foreground/70">
      {createElement(icon, { className: "h-3 w-3" })}
    </span>
  );
}

function formatDurationLong(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return formatDuration(seconds);
}
