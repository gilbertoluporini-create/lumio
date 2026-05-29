"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  CheckSquare,
  Clock,
  FileText,
  Loader2,
  Square,
  Upload,
} from "lucide-react";
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
import { createSubjectAsync, updateSubjectScheduleAsync } from "@/lib/db";
import {
  DAY_LABELS_SHORT,
  SUBJECT_PALETTE,
  type ScheduleSlot,
  type Subject,
} from "@/lib/types";
import { cn } from "@/lib/utils";

/* ---------------- types ---------------- */

type ExtractedSubject = {
  name: string;
  schedule: ScheduleSlot[];
};

type ExtractResponse = {
  subjects?: ExtractedSubject[];
  error?: string;
  demo?: boolean;
};

const NEW_SUBJECT = "__new__";

type PreviewRow = {
  id: string;
  selected: boolean;
  subject: ExtractedSubject;
  /** id da matéria existente a atualizar, ou NEW_SUBJECT pra criar nova. */
  target: string;
};

export type SchedulePdfUploadProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  subjects: Subject[];
  onSaved?: () => void;
};

/* ---------------- subject matching ---------------- */

function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function findSubjectMatch(
  name: string,
  subjects: Subject[],
): string | undefined {
  const g = normalize(name);
  if (!g) return undefined;
  const exact = subjects.find((s) => normalize(s.name) === g);
  if (exact) return exact.id;
  const contains = subjects.find((s) => {
    const n = normalize(s.name);
    return n.includes(g) || g.includes(n);
  });
  if (contains) return contains.id;
  const words = g.split(/\s+/).filter((w) => w.length >= 4);
  if (words.length > 0) {
    const wordMatch = subjects.find((s) => {
      const n = normalize(s.name);
      return words.some((w) => n.includes(w));
    });
    if (wordMatch) return wordMatch.id;
  }
  return undefined;
}

function defaultColorForIndex(idx: number): string {
  return SUBJECT_PALETTE[idx % SUBJECT_PALETTE.length].color;
}

function formatSlots(schedule: ScheduleSlot[]): string {
  if (schedule.length === 0) return "Sem horário detectado";
  return schedule
    .map(
      (s) =>
        `${DAY_LABELS_SHORT[s.dayOfWeek] ?? "?"} ${s.startTime}–${s.endTime}`,
    )
    .join(" · ");
}

/* ---------------- main component ---------------- */

export function SchedulePdfUpload({
  open,
  onOpenChange,
  userId,
  subjects,
  onSaved,
}: SchedulePdfUploadProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        {open && (
          <SchedulePdfUploadBody
            userId={userId}
            subjects={subjects}
            onClose={() => onOpenChange(false)}
            onSaved={() => {
              onSaved?.();
              onOpenChange(false);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function SchedulePdfUploadBody({
  userId,
  subjects,
  onClose,
  onSaved,
}: {
  userId: string;
  subjects: Subject[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<
    "idle" | "extracting" | "preview" | "saving"
  >("idle");
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [demoNote, setDemoNote] = useState(false);

  const selectedCount = useMemo(
    () => rows.filter((r) => r.selected).length,
    [rows],
  );
  const allSelected = rows.length > 0 && selectedCount === rows.length;

  const handleFile = useCallback(
    async (file: File) => {
      setError(null);
      setDemoNote(false);

      const okType =
        file.type === "application/pdf" || file.type.startsWith("image/");
      if (!okType) {
        const msg = "Envie um PDF ou imagem (PNG, JPG, WEBP).";
        setError(msg);
        toast.error(msg);
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        const msg = "Arquivo muito grande (máx 10MB).";
        setError(msg);
        toast.error(msg);
        return;
      }

      setFileName(file.name);
      setPhase("extracting");
      const toastId = toast.loading("Lendo sua grade horária…");

      try {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/extract-schedule", {
          method: "POST",
          body: fd,
        });
        const data: ExtractResponse = await res
          .json()
          .catch(() => ({}) as ExtractResponse);

        if (!res.ok) {
          const msg = data?.error || "Falha ao processar a grade.";
          toast.error(msg, { id: toastId });
          setError(msg);
          setPhase("idle");
          return;
        }

        const extracted = Array.isArray(data.subjects) ? data.subjects : [];
        if (extracted.length === 0) {
          const msg = data?.error || "Não encontrei matérias na grade.";
          toast.message(msg, { id: toastId });
          setError(msg);
          setPhase("idle");
          return;
        }

        const previewRows: PreviewRow[] = extracted.map((s, idx) => {
          const match = findSubjectMatch(s.name, subjects);
          return {
            id: `${idx}`,
            // Por padrão só marca quem tem horário detectado (evita criar
            // matéria vazia ou sobrescrever horário existente com nada).
            selected: s.schedule.length > 0,
            subject: s,
            target: match ?? NEW_SUBJECT,
          };
        });

        setRows(previewRows);
        setDemoNote(!!data.demo);
        setPhase("preview");
        toast.success(
          `${extracted.length} matéria${extracted.length === 1 ? "" : "s"} identificada${extracted.length === 1 ? "" : "s"}.`,
          { id: toastId },
        );
      } catch (err) {
        console.error("[schedule-pdf-upload] extract failed", err);
        const msg =
          err instanceof Error ? err.message : "Erro inesperado ao processar.";
        toast.error(msg, { id: toastId });
        setError(msg);
        setPhase("idle");
      }
    },
    [subjects],
  );

  function toggleRow(id: string) {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, selected: !r.selected } : r)),
    );
  }

  function toggleAll() {
    const next = !allSelected;
    setRows((prev) => prev.map((r) => ({ ...r, selected: next })));
  }

  function setRowTarget(id: string, target: string) {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, target } : r)),
    );
  }

  async function handleSave() {
    const toApply = rows.filter((r) => r.selected);
    if (toApply.length === 0) {
      toast.error("Selecione pelo menos uma matéria.");
      return;
    }

    setPhase("saving");
    let updated = 0;
    let created = 0;
    try {
      // Cor pra matérias novas: continua a paleta a partir das já existentes.
      let newIdx = subjects.length;
      for (const r of toApply) {
        if (r.target === NEW_SUBJECT) {
          await createSubjectAsync(userId, {
            name: r.subject.name,
            color: defaultColorForIndex(newIdx),
            schedule: r.subject.schedule,
          });
          newIdx += 1;
          created += 1;
        } else if (r.subject.schedule.length > 0) {
          // Só atualiza horário de matéria existente quando há horários —
          // nunca sobrescreve uma grade existente com vazio.
          await updateSubjectScheduleAsync(userId, r.target, r.subject.schedule);
          updated += 1;
        }
      }
      const parts: string[] = [];
      if (updated > 0)
        parts.push(`${updated} atualizada${updated === 1 ? "" : "s"}`);
      if (created > 0)
        parts.push(`${created} criada${created === 1 ? "" : "s"}`);
      toast.success(
        parts.length > 0 ? `Agenda salva (${parts.join(", ")}).` : "Agenda salva.",
      );
      onSaved();
    } catch (err) {
      console.error("[schedule-pdf-upload] save failed", err);
      toast.error("Falha ao salvar a agenda. Tente novamente.");
      setPhase("preview");
    }
  }

  function reset() {
    setRows([]);
    setFileName(null);
    setError(null);
    setDemoNote(false);
    setPhase("idle");
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Subir agenda da faculdade</DialogTitle>
        <DialogDescription>
          Envie o PDF ou print da sua grade horária — a IA identifica as
          matérias e horários pra montar seu calendário de aulas.
        </DialogDescription>
      </DialogHeader>

      {phase === "idle" && (
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              "flex w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-background/50 px-4 py-10 transition-colors",
              "hover:border-primary/50 hover:bg-accent/40",
            )}
          >
            <Upload className="h-8 w-8 text-muted-foreground" />
            <div className="text-sm font-medium">
              Clique pra selecionar um PDF ou imagem
            </div>
            <div className="text-xs text-muted-foreground">
              Grade horária, plano de ensino, print do portal… (máx 10MB)
            </div>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,.pdf,image/png,image/jpeg,image/webp,image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              e.target.value = "";
            }}
          />
          {error && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}
        </div>
      )}

      {phase === "extracting" && (
        <div className="flex flex-col items-center justify-center gap-3 py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <div className="text-sm font-medium">Lendo sua grade…</div>
          {fileName && (
            <div className="text-xs text-muted-foreground truncate max-w-xs">
              {fileName}
            </div>
          )}
        </div>
      )}

      {phase === "preview" && (
        <div className="space-y-3">
          {demoNote && (
            <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
              <AlertCircle className="h-4 w-4 shrink-0" />
              Modo demo (sem ANTHROPIC_API_KEY). Matérias fictícias pra teste.
            </div>
          )}
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              {fileName && (
                <span className="inline-flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5" />
                  <span className="truncate max-w-[200px]">{fileName}</span>
                </span>
              )}
              <button
                type="button"
                onClick={reset}
                className="text-primary hover:underline"
              >
                trocar arquivo
              </button>
            </div>
            <button
              type="button"
              onClick={toggleAll}
              className="inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 hover:bg-accent transition-colors"
            >
              {allSelected ? (
                <CheckSquare className="h-3.5 w-3.5" />
              ) : (
                <Square className="h-3.5 w-3.5" />
              )}
              {allSelected ? "Desmarcar todas" : "Marcar todas"}
            </button>
          </div>

          <div className="max-h-[50vh] space-y-2 overflow-y-auto pr-1">
            {rows.map((r) => {
              const matchedExisting =
                r.target !== NEW_SUBJECT
                  ? subjects.find((s) => s.id === r.target)
                  : undefined;
              return (
                <div
                  key={r.id}
                  className={cn(
                    "flex items-start gap-3 rounded-lg border border-border/70 bg-card/50 px-3 py-2.5 transition-opacity",
                    !r.selected && "opacity-50",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => toggleRow(r.id)}
                    className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center"
                    aria-label={r.selected ? "Desmarcar" : "Selecionar"}
                  >
                    {r.selected ? (
                      <CheckSquare className="h-4 w-4 text-primary" />
                    ) : (
                      <Square className="h-4 w-4 text-muted-foreground" />
                    )}
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-foreground">
                      {r.subject.name}
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <Clock className="h-3 w-3 shrink-0" />
                      <span className="truncate">
                        {formatSlots(r.subject.schedule)}
                      </span>
                    </div>
                  </div>
                  <div className="shrink-0">
                    <select
                      value={r.target}
                      onChange={(e) => setRowTarget(r.id, e.target.value)}
                      className={cn(
                        "h-8 w-44 rounded border border-input bg-background px-1.5 text-[11px]",
                        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                      )}
                    >
                      <option value={NEW_SUBJECT}>+ Criar nova matéria</option>
                      {subjects.map((s) => (
                        <option key={s.id} value={s.id}>
                          Atualizar: {s.name}
                        </option>
                      ))}
                    </select>
                    {matchedExisting && (
                      <div className="mt-1 text-right text-[10px] text-muted-foreground">
                        substitui horário atual
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {phase === "saving" && (
        <div className="flex flex-col items-center justify-center gap-3 py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <div className="text-sm font-medium">Salvando agenda…</div>
        </div>
      )}

      <DialogFooter className="gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={onClose}
          disabled={phase === "extracting" || phase === "saving"}
        >
          Cancelar
        </Button>
        {phase === "preview" && (
          <Button
            type="button"
            variant="gradient"
            onClick={handleSave}
            disabled={selectedCount === 0}
          >
            Salvar {selectedCount} matéria{selectedCount === 1 ? "" : "s"}
          </Button>
        )}
      </DialogFooter>
    </>
  );
}
