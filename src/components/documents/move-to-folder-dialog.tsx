"use client";

import { useState } from "react";
import { Check, FolderInput, Loader2 } from "lucide-react";
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
import { cn } from "@/lib/utils";
import type { Subject } from "@/lib/types";

/**
 * Alvo de movimentação. Cada tipo atualiza a tabela certa:
 *  - summary  → summaries.subject_id (resumo move sozinho)
 *  - document → documents.subject_id (PDF move sozinho)
 *  - lecture  → lectures.subject_id (move a aula + tudo que herda dela:
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
  /** Aviso opcional mostrado no dialog (ex.: move a aula inteira). */
  note?: string;
};

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
  const [picked, setPicked] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const effectivePick = picked ?? target?.currentSubjectId ?? null;

  async function handleConfirm() {
    if (!target || !effectivePick) return;
    if (effectivePick === target.currentSubjectId) {
      onOpenChange(false);
      setPicked(null);
      return;
    }
    setSaving(true);
    try {
      if (target.kind === "summary") {
        await updateSummaryAsync(userId, target.id, { subjectId: effectivePick });
      } else if (target.kind === "document") {
        await updateDocumentAsync(userId, target.id, { subjectId: effectivePick });
      } else {
        await updateLectureAsync(userId, target.id, { subjectId: effectivePick });
      }
      toast.success("Movido de pasta.");
      onMoved?.();
      onOpenChange(false);
      setPicked(null);
    } catch (err) {
      toast.error(`Erro ao mover: ${(err as Error).message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setPicked(null);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderInput className="h-4 w-4 text-primary" />
            Mover para pasta
          </DialogTitle>
          <DialogDescription>
            {target?.title ?? "Escolha a matéria de destino."}
          </DialogDescription>
        </DialogHeader>

        {target?.note && (
          <p className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
            {target.note}
          </p>
        )}

        <div className="space-y-2 max-h-[320px] overflow-y-auto -mx-1 px-1">
          {subjects.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              Você ainda não tem matérias. Crie uma no dashboard primeiro.
            </p>
          ) : (
            subjects.map((s) => {
              const sel = effectivePick === s.id;
              const isCurrent = target?.currentSubjectId === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setPicked(s.id)}
                  className={cn(
                    "w-full flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors",
                    sel
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-secondary/50",
                  )}
                  aria-pressed={sel}
                >
                  <span
                    className={cn(
                      "h-7 w-7 rounded-md shrink-0 bg-gradient-to-br",
                      s.color,
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{s.name}</div>
                    {isCurrent && (
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        Pasta atual
                      </div>
                    )}
                  </div>
                  {sel && <Check className="h-4 w-4 text-primary shrink-0" />}
                </button>
              );
            })
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            variant="default"
            disabled={
              !effectivePick ||
              saving ||
              effectivePick === target?.currentSubjectId
            }
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
