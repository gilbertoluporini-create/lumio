"use client";

import { createElement, useEffect, useMemo, useState } from "react";
import { Check, ChevronRight, Folder as FolderIcon, FolderInput, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { updateLectureAsync } from "@/lib/db";
import { updateDocumentAsync } from "@/lib/documents";
import { updateSummaryAsync } from "@/lib/summaries";
import { listFoldersBySubjectAsync } from "@/lib/folders";
import { getSubjectIcon } from "@/lib/subject-icon";
import { cn } from "@/lib/utils";
import type { Folder, Subject } from "@/lib/types";

/**
 * Alvo de movimentação. Cada tipo atualiza a tabela certa:
 *  - summary  → summaries.subject_id + folder_id (resumo move sozinho)
 *  - document → documents.subject_id + folder_id (PDF move sozinho)
 *  - lecture  → lectures.subject_id + folder_id (move a aula + tudo que herda:
 *               transcrição, slides, flashcards/quiz/mapa gerados)
 * Assets gerados (flashcards/quiz/mapa) não têm subject_id próprio — herdam
 * da aula. Por isso passamos lectureId e movemos a aula inteira.
 */
export type MoveTarget = {
  kind: "summary" | "document" | "lecture";
  /** id do resumo, do documento, ou da AULA (quando kind=lecture). */
  id: string;
  title: string;
  currentSubjectId?: string | null;
  /** Pasta atual (dentro da matéria). null = raiz. */
  currentFolderId?: string | null;
  /** Aviso opcional mostrado no dialog (ex.: move a aula inteira). */
  note?: string;
};

/**
 * Constrói árvore plana com indentação por profundidade. Usado pra mostrar
 * a estrutura de pastas como lista hierárquica sem precisar de tree real.
 */
function flattenWithDepth(folders: Folder[]): Array<Folder & { depth: number }> {
  const byParent = new Map<string | null, Folder[]>();
  for (const f of folders) {
    const key = f.parentFolderId ?? null;
    const arr = byParent.get(key) ?? [];
    arr.push(f);
    byParent.set(key, arr);
  }
  // Ordena cada nível por position depois nome
  for (const [, arr] of byParent) {
    arr.sort((a, b) =>
      a.position !== b.position
        ? a.position - b.position
        : a.name.localeCompare(b.name, "pt-BR"),
    );
  }
  const out: Array<Folder & { depth: number }> = [];
  function walk(parentId: string | null, depth: number) {
    for (const f of byParent.get(parentId) ?? []) {
      out.push({ ...f, depth });
      walk(f.id, depth + 1);
    }
  }
  walk(null, 0);
  return out;
}

export function MoveToFolderDialog({
  open,
  onOpenChange,
  userId,
  subjects,
  target,
  onMoved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  subjects: Subject[];
  target: MoveTarget | null;
  onMoved?: () => void;
}) {
  const [pickedSubject, setPickedSubject] = useState<string | null>(null);
  // null = raiz da matéria. Quando user troca de matéria volta pra null.
  const [pickedFolder, setPickedFolder] = useState<string | null>(null);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loadingFolders, setLoadingFolders] = useState(false);
  const [saving, setSaving] = useState(false);

  const effectiveSubject = pickedSubject ?? target?.currentSubjectId ?? null;
  const subjectChanged =
    !!target &&
    effectiveSubject !== null &&
    effectiveSubject !== (target.currentSubjectId ?? null);
  // Quando o user trocou de matéria, força ir pra raiz (não faz sentido manter
  // uma pasta de matéria diferente como destino).
  const effectiveFolder = subjectChanged
    ? pickedFolder // só o que ele escolher na nova matéria
    : (pickedFolder ?? target?.currentFolderId ?? null);

  // Reset ao abrir/fechar.
  useEffect(() => {
    if (!open) {
      setPickedSubject(null);
      setPickedFolder(null);
      setFolders([]);
    }
  }, [open]);

  // Carrega pastas da matéria efetiva (a atual ou a que o user escolheu).
  useEffect(() => {
    if (!open || !effectiveSubject) return;
    let cancelled = false;
    setLoadingFolders(true);
    listFoldersBySubjectAsync(userId, effectiveSubject)
      .then((fld) => {
        if (!cancelled) setFolders(fld);
      })
      .finally(() => {
        if (!cancelled) setLoadingFolders(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, effectiveSubject, open]);

  const flatFolders = useMemo(() => flattenWithDepth(folders), [folders]);

  async function handleConfirm() {
    if (!target || !effectiveSubject) return;
    const sameSubject = effectiveSubject === (target.currentSubjectId ?? null);
    const sameFolder = (effectiveFolder ?? null) === (target.currentFolderId ?? null);
    if (sameSubject && sameFolder) {
      onOpenChange(false);
      return;
    }
    setSaving(true);
    try {
      const patch: { subjectId: string; folderId: string | null } = {
        subjectId: effectiveSubject,
        folderId: effectiveFolder ?? null,
      };
      if (target.kind === "summary") {
        await updateSummaryAsync(userId, target.id, patch);
      } else if (target.kind === "document") {
        await updateDocumentAsync(userId, target.id, patch);
      } else {
        await updateLectureAsync(userId, target.id, patch);
      }
      toast.success("Movido.");
      onMoved?.();
      onOpenChange(false);
    } catch (err) {
      toast.error(`Erro ao mover: ${(err as Error).message}`);
    } finally {
      setSaving(false);
    }
  }

  const isUnchanged =
    !!target &&
    effectiveSubject === (target.currentSubjectId ?? null) &&
    (effectiveFolder ?? null) === (target.currentFolderId ?? null);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderInput className="h-4 w-4 text-primary" />
            Mover
          </DialogTitle>
          <DialogDescription>
            {target?.title ?? "Escolha a matéria e pasta de destino."}
          </DialogDescription>
        </DialogHeader>

        {target?.note && (
          <p className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
            {target.note}
          </p>
        )}

        {/* Etapa 1: matéria */}
        <div>
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium mb-2">
            Matéria
          </p>
          <div className="space-y-1.5 max-h-[200px] overflow-y-auto -mx-1 px-1">
            {subjects.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                Você ainda não tem matérias. Crie uma no dashboard primeiro.
              </p>
            ) : (
              subjects.map((s) => {
                const sel = effectiveSubject === s.id;
                const isCurrent = target?.currentSubjectId === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      setPickedSubject(s.id);
                      setPickedFolder(null);
                    }}
                    className={cn(
                      "w-full flex items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors",
                      sel
                        ? "border-primary bg-primary/5"
                        : "border-border hover:bg-secondary/50",
                    )}
                    aria-pressed={sel}
                  >
                    <span className="h-8 w-8 rounded-lg shrink-0 bg-primary/10 dark:bg-primary/15 flex items-center justify-center">
                      {createElement(getSubjectIcon(s.name), {
                        className: "h-4 w-4 text-primary",
                        strokeWidth: 2.2,
                      })}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{s.name}</div>
                      {isCurrent && (
                        <div className="text-[10px] text-muted-foreground mt-0.5">
                          Matéria atual
                        </div>
                      )}
                    </div>
                    {sel && <Check className="h-4 w-4 text-primary shrink-0" />}
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Etapa 2: pasta dentro da matéria */}
        {effectiveSubject && (
          <div>
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium mb-2">
              Pasta
            </p>
            {loadingFolders ? (
              <div className="py-4 text-center text-xs text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin mx-auto" />
              </div>
            ) : (
              <div className="space-y-1 max-h-[200px] overflow-y-auto -mx-1 px-1">
                <FolderPickItem
                  label="Raiz da matéria"
                  depth={0}
                  selected={(effectiveFolder ?? null) === null}
                  isCurrent={
                    (target?.currentFolderId ?? null) === null &&
                    effectiveSubject === (target?.currentSubjectId ?? null)
                  }
                  onClick={() => setPickedFolder(null)}
                />
                {flatFolders.map((f) => (
                  <FolderPickItem
                    key={f.id}
                    label={f.name}
                    depth={f.depth}
                    selected={effectiveFolder === f.id}
                    isCurrent={
                      target?.currentFolderId === f.id &&
                      effectiveSubject === (target?.currentSubjectId ?? null)
                    }
                    onClick={() => setPickedFolder(f.id)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            variant="default"
            disabled={!effectiveSubject || saving || isUnchanged}
            onClick={handleConfirm}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Mover
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FolderPickItem({
  label,
  depth,
  selected,
  isCurrent,
  onClick,
}: {
  label: string;
  depth: number;
  selected: boolean;
  isCurrent: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-2 rounded-md border px-3 py-1.5 text-left transition-colors text-sm",
        selected
          ? "border-primary bg-primary/5"
          : "border-border hover:bg-secondary/50",
      )}
      aria-pressed={selected}
      style={{ paddingLeft: `${depth * 16 + 12}px` }}
    >
      {depth > 0 && (
        <ChevronRight className="h-3 w-3 text-muted-foreground/60 shrink-0" />
      )}
      <FolderIcon
        className={cn(
          "h-4 w-4 shrink-0",
          selected ? "text-primary" : "text-muted-foreground",
        )}
      />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {isCurrent && (
        <span className="text-[10px] text-muted-foreground">atual</span>
      )}
      {selected && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
    </button>
  );
}
