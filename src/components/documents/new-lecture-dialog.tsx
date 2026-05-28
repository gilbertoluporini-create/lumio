"use client";

import { createElement, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Mic } from "lucide-react";
import { toast } from "sonner";
import { getSubjectIcon } from "@/lib/subject-icon";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createLectureAsync } from "@/lib/db";
import { cn } from "@/lib/utils";
import type { Subject } from "@/lib/types";

export function NewLectureDialog({
  open,
  onOpenChange,
  userId,
  subjects,
  defaultSubjectId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  subjects: Subject[];
  defaultSubjectId?: string;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [subjectId, setSubjectId] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle("");
    setSubjectId(defaultSubjectId ?? subjects[0]?.id ?? "");
  }, [open, defaultSubjectId, subjects]);

  async function handleConfirm() {
    if (!subjectId) {
      toast.error("Escolha uma matéria.");
      return;
    }
    const finalTitle =
      title.trim() || `Aula ${new Date().toLocaleDateString("pt-BR")}`;
    setSubmitting(true);
    try {
      const lecture = await createLectureAsync(userId, {
        subjectId,
        title: finalTitle,
      });
      onOpenChange(false);
      router.push(`/lecture/${lecture.id}`);
    } catch (err) {
      toast.error(`Erro ao criar aula: ${(err as Error).message}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova aula</DialogTitle>
          <DialogDescription>
            Em segundos a transcrição começa.
          </DialogDescription>
        </DialogHeader>

        {subjects.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            Crie uma matéria primeiro no dashboard.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="new-lecture-title">Título</Label>
              <Input
                id="new-lecture-title"
                autoFocus
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={`Aula ${new Date().toLocaleDateString("pt-BR")}`}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Matéria</Label>
              <div className="flex flex-wrap gap-2">
                {subjects.map((s) => {
                  const sel = s.id === subjectId;
                  const Icon = getSubjectIcon(s.name);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setSubjectId(s.id)}
                      className={cn(
                        "inline-flex items-center gap-2 rounded-full border py-1.5 pl-1.5 pr-3 text-sm transition-all",
                        sel
                          ? "border-primary bg-primary/10 text-foreground"
                          : "border-border bg-background hover:bg-secondary/40",
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br shadow-sm",
                          s.color,
                        )}
                      >
                        {createElement(Icon, {
                          className: "h-3.5 w-3.5 text-white",
                          strokeWidth: 2.4,
                        })}
                      </span>
                      {s.name}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            variant="gradient"
            onClick={handleConfirm}
            disabled={submitting || subjects.length === 0}
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Mic className="h-4 w-4" />
            )}
            Começar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
