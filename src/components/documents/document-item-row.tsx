"use client";

import Link from "next/link";
import { MoreHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn, formatRelativeTime } from "@/lib/utils";
import {
  DocumentIconBadge,
} from "@/components/documents/document-icon";
import {
  getDocumentKindLabel,
  type DocumentItem,
} from "@/hooks/use-all-documents";

export function DocumentItemRow({
  doc,
  onAssignSubject,
  className,
  showSubject = true,
  compact = false,
}: {
  doc: DocumentItem;
  onAssignSubject?: (doc: DocumentItem) => void;
  className?: string;
  showSubject?: boolean;
  compact?: boolean;
}) {
  const originLabel = doc.origin === "upload" ? "Upload" : "Gerado pelo Lumio";
  const kindLabel = getDocumentKindLabel(doc.kind);

  return (
    <div
      className={cn(
        "group flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-secondary/50 transition-colors",
        compact && "px-1.5 py-1.5",
        className,
      )}
    >
      <DocumentIconBadge kind={doc.kind} size={compact ? 28 : 32} />

      <Link
        href={doc.href}
        className="min-w-0 flex-1 flex items-center gap-3 group/link"
      >
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium truncate group-hover/link:text-primary transition-colors">
            {doc.title}
          </div>
          <div className="text-[11px] text-muted-foreground truncate">
            {kindLabel}
            {showSubject && doc.subjectName ? ` · ${doc.subjectName}` : ""}
            {" · "}
            {originLabel}
            {doc.meta ? ` · ${doc.meta}` : ""}
          </div>
        </div>
        <span className="text-[11px] text-muted-foreground/80 shrink-0 hidden sm:inline-block font-mono tabular-nums">
          {formatRelativeTime(doc.date)}
        </span>
      </Link>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="shrink-0 h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-secondary/70 hover:text-foreground transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
            aria-label="Mais ações"
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem asChild>
            <Link href={doc.href}>Abrir</Link>
          </DropdownMenuItem>
          {onAssignSubject && (
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                onAssignSubject(doc);
              }}
            >
              {doc.subjectId ? "Mudar de matéria" : "Atribuir matéria"}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem asChild>
            <Link href={`/lecture/${doc.lectureId}`}>Abrir aula de origem</Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
