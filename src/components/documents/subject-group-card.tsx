"use client";

import { createElement, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, MoreHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn, formatRelativeTime } from "@/lib/utils";
import { getSubjectIcon } from "@/lib/subject-icon";
import type { Subject } from "@/lib/types";
import type { DocumentItem } from "@/hooks/use-all-documents";
import { DocumentItemRow } from "./document-item-row";

const PREVIEW_LIMIT = 6;

export function SubjectGroupCard({
  subject,
  docs,
  totalOrgRatio,
  onAssignSubject,
  onDelete,
  defaultExpanded = true,
}: {
  subject: Subject;
  docs: DocumentItem[];
  totalOrgRatio: number;
  onAssignSubject?: (doc: DocumentItem) => void;
  onDelete?: (doc: DocumentItem) => void;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const Icon = getSubjectIcon(subject.name);
  const pct = Math.round(Math.max(0, Math.min(1, totalOrgRatio)) * 100);

  const newest = docs[0]?.date;
  const lastLabel = newest ? `Atualizado ${formatRelativeTime(newest)}` : "Sem documentos ainda";

  const visible = expanded ? docs.slice(0, PREVIEW_LIMIT) : [];

  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <header className="flex items-start gap-3">
        <span className="h-10 w-10 rounded-lg bg-primary/10 dark:bg-primary/15 flex items-center justify-center shrink-0">
          {createElement(Icon, {
            className: "h-5 w-5 text-primary",
            strokeWidth: 2.2,
          })}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold truncate">{subject.name}</h3>
          <div className="text-xs text-muted-foreground mt-0.5">
            {docs.length} documento{docs.length === 1 ? "" : "s"} · {lastLabel}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-secondary/60 hover:text-foreground transition-colors"
                aria-label="Mais ações da matéria"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem asChild>
                <Link href={`/subject/${subject.id}`}>Abrir pasta</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={`/resumos?subject=${subject.id}`}>
                  Ver resumos
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={`/gravacoes?subject=${subject.id}`}>
                  Ver gravações
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-secondary/60 hover:text-foreground transition-colors"
            aria-label={expanded ? "Recolher" : "Expandir"}
            aria-expanded={expanded}
          >
            {expanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </button>
        </div>
      </header>

      <div className="mt-4">
        <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1.5">
          <span>{pct}% organizado</span>
          <span>{docs.length} item{docs.length === 1 ? "" : "s"}</span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-secondary/60 overflow-hidden">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {expanded && docs.length > 0 && (
        <div className={cn("mt-4 grid gap-2", "grid-cols-1 md:grid-cols-2")}>
          {visible.map((doc) => (
            <DocumentItemRow
              key={doc.id}
              doc={doc}
              onAssignSubject={onAssignSubject}
              onDelete={onDelete}
              showSubject={false}
            />
          ))}
        </div>
      )}

      {expanded && docs.length === 0 && (
        <div className="mt-4 rounded-lg border border-dashed border-border/60 px-4 py-6 text-center text-xs text-muted-foreground">
          Nenhum documento ainda. Grave uma aula ou faça upload de um PDF
          atribuído a esta matéria.
        </div>
      )}

      {expanded && docs.length > PREVIEW_LIMIT && (
        <div className="mt-3 flex items-center justify-end">
          <Link
            href={`/subject/${subject.id}`}
            className="text-xs text-primary font-medium inline-flex items-center gap-1 hover:gap-1.5 transition-all"
          >
            Ver todos ({docs.length}) →
          </Link>
        </div>
      )}
    </section>
  );
}
