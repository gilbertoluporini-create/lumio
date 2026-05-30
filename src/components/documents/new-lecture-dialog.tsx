"use client";

import { createElement, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Mic, Upload } from "lucide-react";
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
import { UploadAudioCard } from "@/components/lecture/upload-audio-card";
import type { Subject } from "@/lib/types";

export function NewLectureDialog({
  open,
  onOpenChange,
  userId,
  subjects,
  defaultSubjectId,
  defaultMode = "live",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  subjects: Subject[];
  defaultSubjectId?: string;
  defaultMode?: "live" | "upload";
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [subjectId, setSubjectId] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [mode, setMode] = useState<"live" | "upload">(defaultMode);

  useEffect(() => {
    if (!open) return;
    setTitle("");
    setSubjectId(defaultSubjectId ?? subjects[0]?.id ?? "");
    setMode(defaultMode);
  }, [open, defaultSubjectId, defaultMode, subjects]);

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
      <DialogContent className="max-w-lg overflow-hidden [&>*]:min-w-0">
        <DialogHeader>
          <DialogTitle>Nova aula</DialogTitle>
          <DialogDescription>
            {mode === "live"
              ? "Em segundos a transcrição começa."
              : "Suba um áudio que você já gravou — até ~3h."}
          </DialogDescription>
        </DialogHeader>

        {subjects.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            Crie uma matéria primeiro no dashboard.
          </p>
        ) : (
          <>
            {/* Tabs Gravar / Subir */}
            <div className="flex gap-1 rounded-lg bg-secondary/60 p-1">
              <button
                type="button"
                onClick={() => setMode("live")}
                className={cn(
                  "flex-1 inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  mode === "live"
                    ? "bg-background shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Mic className="h-3.5 w-3.5" />
                Gravar ao vivo
              </button>
              <button
                type="button"
                onClick={() => setMode("upload")}
                className={cn(
                  "flex-1 inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  mode === "upload"
                    ? "bg-background shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Upload className="h-3.5 w-3.5" />
                Subir áudio
              </button>
            </div>

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
                          "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-all",
                          sel
                            ? "border-primary bg-primary/10 text-foreground"
                            : "border-border bg-background text-muted-foreground hover:bg-secondary/40 hover:text-foreground",
                        )}
                      >
                        {createElement(Icon, {
                            className: cn(
                              "h-4 w-4 shrink-0",
                              sel ? "text-primary" : "text-muted-foreground",
                            ),
                            strokeWidth: 1.8,
                          })}
                        {s.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              {mode === "upload" && (
                <UploadAudioCard
                  userId={userId}
                  subjectId={subjectId || null}
                  fallbackTitle={title}
                  onSuccess={() => onOpenChange(false)}
                />
              )}
            </div>
          </>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          {mode === "live" && subjects.length > 0 && (
            <Button
              variant="gradient"
              onClick={handleConfirm}
              disabled={submitting}
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Mic className="h-4 w-4" />
              )}
              Começar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
