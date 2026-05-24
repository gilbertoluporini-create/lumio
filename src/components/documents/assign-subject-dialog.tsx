"use client";

import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
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
import { cn } from "@/lib/utils";
import type { Subject } from "@/lib/types";
import type { DocumentItem } from "@/hooks/use-all-documents";

export function AssignSubjectDialog({
  open,
  onOpenChange,
  doc,
  subjects,
  userId,
  suggestedSubjectId,
  onAssigned,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  doc: DocumentItem | null;
  subjects: Subject[];
  userId: string;
  suggestedSubjectId?: string | null;
  onAssigned?: (lectureId: string, subjectId: string) => void;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const effectivePick = picked ?? doc?.subjectId ?? suggestedSubjectId ?? null;

  async function handleConfirm() {
    if (!doc || !effectivePick) return;
    setSaving(true);
    try {
      await updateLectureAsync(userId, doc.lectureId, {
        subjectId: effectivePick,
      });
      toast.success("Documento atribuído à matéria.");
      onAssigned?.(doc.lectureId, effectivePick);
      onOpenChange(false);
      setPicked(null);
    } catch (err) {
      toast.error(`Erro ao atribuir: ${(err as Error).message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Atribuir matéria</DialogTitle>
          <DialogDescription>
            {doc?.title ?? "Escolha uma matéria pra este documento."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 max-h-[320px] overflow-y-auto -mx-1 px-1">
          {subjects.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              Você ainda não tem matérias. Crie uma no dashboard primeiro.
            </p>
          ) : (
            subjects.map((s) => {
              const sel = effectivePick === s.id;
              const isSuggested = suggestedSubjectId === s.id;
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
                    {isSuggested && (
                      <div className="text-[10px] text-primary mt-0.5">
                        Sugerido pelo Lumio
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
            disabled={!effectivePick || saving}
            onClick={handleConfirm}
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : null}
            Confirmar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
