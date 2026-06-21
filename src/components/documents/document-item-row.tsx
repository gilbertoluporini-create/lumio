"use client";

import Link from "next/link";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
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
  onDelete,
  onRename,
  className,
  showSubject = true,
  compact = false,
}: {
  doc: DocumentItem;
  onAssignSubject?: (doc: DocumentItem) => void;
  /** Quando provido, mostra "Excluir" no dropdown. Pai resolve a deleção
   *  via deleteDocumentItemAsync (cobre todos os kinds). */
  onDelete?: (doc: DocumentItem) => void;
  /** Quando provido, mostra "Renomear" — só pra documentos (PDF) e resumos.
   *  Pai resolve via updateDocumentAsync / updateSummaryAsync pelo id/kind. */
  onRename?: (doc: DocumentItem) => void;
  className?: string;
  showSubject?: boolean;
  compact?: boolean;
}) {
  const originLabel = doc.origin === "upload" ? "Upload" : "Gerado pelo Lumio";
  const kindLabel = getDocumentKindLabel(doc.kind);
  // Renomeável: resumo, ou PDF standalone (id "document:") — NÃO slides de aula
  // ("lecture-slides:") nem aulas/assets gerados.
  const canRename =
    doc.kind === "summary" ||
    (doc.kind === "pdf-upload" && doc.id.startsWith("document:"));

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
          {onRename && canRename && (
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                onRename(doc);
              }}
            >
              <Pencil className="h-3.5 w-3.5" />
              Renomear
            </DropdownMenuItem>
          )}
          {onDelete && doc.kind !== "transcription" && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault();
                  onDelete(doc);
                }}
                className="text-destructive focus:text-destructive focus:bg-destructive/10"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Excluir
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
