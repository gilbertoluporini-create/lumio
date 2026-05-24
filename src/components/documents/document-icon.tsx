"use client";

import { createElement } from "react";
import {
  AudioWaveform,
  FileText,
  FileType,
  GitBranch,
  HelpCircle,
  Layers,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { DocumentKind } from "@/hooks/use-all-documents";

const KIND_ICON: Record<DocumentKind, LucideIcon> = {
  transcription: AudioWaveform,
  summary: FileText,
  flashcards: Layers,
  quiz: HelpCircle,
  mindmap: GitBranch,
  "pdf-upload": FileType,
};

const KIND_COLOR: Record<DocumentKind, string> = {
  transcription: "text-violet-600 dark:text-violet-400 bg-violet-500/10",
  summary: "text-primary bg-primary/10",
  flashcards: "text-sky-600 dark:text-sky-400 bg-sky-500/10",
  quiz: "text-amber-600 dark:text-amber-400 bg-amber-500/10",
  mindmap: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10",
  "pdf-upload": "text-rose-600 dark:text-rose-400 bg-rose-500/10",
};

export function getDocumentIcon(kind: DocumentKind): LucideIcon {
  return KIND_ICON[kind];
}

export function DocumentIconBadge({
  kind,
  size = 32,
  className,
}: {
  kind: DocumentKind;
  size?: number;
  className?: string;
}) {
  const Icon = KIND_ICON[kind];
  const iconSize = Math.max(12, Math.round(size * 0.5));
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-md shrink-0",
        KIND_COLOR[kind],
        className,
      )}
      style={{ width: size, height: size }}
    >
      {createElement(Icon, {
        width: iconSize,
        height: iconSize,
        strokeWidth: 2.2,
      })}
    </span>
  );
}
