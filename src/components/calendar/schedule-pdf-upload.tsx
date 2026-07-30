"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  CheckSquare,
  Clock,
  FileText,
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
import { ProgressPanel } from "@/components/ui/progress-bar";
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
  /**
   * O que já foi gravado no banco pra esta linha (espelho do ledger em ref).
   * Existe pra travar a linha no preview: depois de gravada, mudar o destino
   * não teria efeito nenhum num novo "Salvar".
   */
  appliedKind?: AppliedKind;
};

/** O que aconteceu com uma linha do preview no banco. "noop" = nada a gravar. */
type AppliedKind = "created" | "updated" | "noop";

function countApplied(
  rows: PreviewRow[],
  applied: Map<string, AppliedKind>,
): { created: number; updated: number; handled: number } {
  let created = 0;
  let updated = 0;
  let handled = 0;
  for (const r of rows) {
    const kind = applied.get(r.id);
    if (!kind) continue;
    handled += 1;
    if (kind === "created") created += 1;
    else if (kind === "updated") updated += 1;
  }
  return { created, updated, handled };
}

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

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/**
 * Funde aulas geminadas num bloco só. A grade da faculdade vem em "tempos"
 * de ~50min (07:30-08:20, 08:20-09:10), então uma aula dupla virava a tripa
 * "Ter 07:30–08:20 · Ter 08:20–09:10". Aqui vira "Ter 07:30–09:10".
 * Tolerância de 15min cobre o intervalinho entre tempos.
 */
const GAP_TOLERANCE_MIN = 15;

type DayBlocks = { day: number; blocks: Array<{ start: string; end: string }> };

/**
 * Fusão sobre ScheduleSlot (preserva `room`). É ESTA que vai pro banco —
 * o preview deriva daqui pra que o que o aluno confere seja exatamente o
 * que a agenda vai mostrar.
 */
function mergeSlots(schedule: ScheduleSlot[]): ScheduleSlot[] {
  const byDay = new Map<number, ScheduleSlot[]>();
  for (const s of schedule) {
    const list = byDay.get(s.dayOfWeek);
    if (list) list.push(s);
    else byDay.set(s.dayOfWeek, [s]);
  }
  const out: ScheduleSlot[] = [];
  for (const [day, slots] of byDay) {
    const sorted = [...slots].sort(
      (a, b) => toMinutes(a.startTime) - toMinutes(b.startTime),
    );
    for (const s of sorted) {
      const last = out.length > 0 ? out[out.length - 1] : undefined;
      if (
        last &&
        last.dayOfWeek === day &&
        toMinutes(s.startTime) - toMinutes(last.endTime) <= GAP_TOLERANCE_MIN &&
        // Só funde se a sala for a mesma: salas diferentes = aulas diferentes.
        (last.room ?? "") === (s.room ?? "")
      ) {
        // Encosta no bloco anterior: estende (nunca encurta).
        if (toMinutes(s.endTime) > toMinutes(last.endTime)) last.endTime = s.endTime;
      } else {
        out.push({ ...s });
      }
    }
  }
  return out;
}

function mergeSlotsByDay(schedule: ScheduleSlot[]): DayBlocks[] {
  const byDay = new Map<number, Array<{ start: string; end: string }>>();
  for (const s of mergeSlots(schedule)) {
    const block = { start: s.startTime, end: s.endTime };
    const blocks = byDay.get(s.dayOfWeek);
    if (blocks) blocks.push(block);
    else byDay.set(s.dayOfWeek, [block]);
  }
  const out: DayBlocks[] = [];
  for (const [day, blocks] of byDay) out.push({ day, blocks });
  // Ordena Seg→Dom (domingo por último, não primeiro).
  return out.sort((a, b) => ((a.day + 6) % 7) - ((b.day + 6) % 7));
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
            // Recarrega as matérias SEM fechar o diálogo: numa falha no meio do
            // loop, a tela precisa refletir o que já foi gravado e ainda deixar
            // o aluno clicar "Salvar" pra continuar de onde parou.
            onProgress={() => onSaved?.()}
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
  onProgress,
}: {
  userId: string;
  subjects: Subject[];
  onClose: () => void;
  onSaved: () => void;
  /** Recarrega as matérias da tela sem fechar o diálogo (gravação parcial). */
  onProgress?: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<
    "idle" | "extracting" | "preview" | "saving"
  >("idle");
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [demoNote, setDemoNote] = useState(false);
  /**
   * O que JÁ foi gravado no banco, por linha do preview. Fica em ref (imune a
   * re-render) pra que um retry depois de falha no meio do loop não recrie as
   * matérias já criadas — createSubjectAsync não é idempotente e duplicaria a
   * matéria (e cada aula dela na agenda).
   */
  const appliedRef = useRef<Map<string, AppliedKind>>(new Map());

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

  /** Espelha no state o que o ledger (ref) já gravou, pra travar a linha. */
  function markRowApplied(id: string, kind: AppliedKind) {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, appliedKind: kind } : r)),
    );
  }

  async function handleSave() {
    const toApply = rows.filter((r) => r.selected);
    if (toApply.length === 0) {
      toast.error("Selecione pelo menos uma matéria.");
      return;
    }

    setPhase("saving");
    const applied = appliedRef.current;
    /** Linhas gravadas NESTA tentativa — o toast de sucesso só conta estas. */
    const appliedNow = new Set<string>();
    try {
      // Cor pra matérias novas: continua a paleta a partir das já existentes.
      let newIdx = subjects.length;
      for (const r of toApply) {
        // Retry idempotente: o que já entrou no banco não é gravado de novo.
        if (applied.has(r.id)) continue;
        if (r.target === NEW_SUBJECT) {
          await createSubjectAsync(userId, {
            name: r.subject.name,
            color: defaultColorForIndex(newIdx),
            schedule: mergeSlots(r.subject.schedule),
          });
          newIdx += 1;
          applied.set(r.id, "created");
          markRowApplied(r.id, "created");
        } else if (r.subject.schedule.length > 0) {
          // Só atualiza horário de matéria existente quando há horários —
          // nunca sobrescreve uma grade existente com vazio.
          await updateSubjectScheduleAsync(
            userId,
            r.target,
            mergeSlots(r.subject.schedule),
          );
          applied.set(r.id, "updated");
          markRowApplied(r.id, "updated");
        } else {
          applied.set(r.id, "noop");
          markRowApplied(r.id, "noop");
        }
        appliedNow.add(r.id);
      }
      const { created, updated } = countApplied(
        toApply.filter((r) => appliedNow.has(r.id)),
        applied,
      );
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
      // Gravação PARCIAL: recarrega a tela pra ela não mentir sobre o banco.
      onProgress?.();
      const { handled } = countApplied(toApply, applied);
      toast.error(
        `${handled} de ${toApply.length} matéria${toApply.length === 1 ? "" : "s"} salva${handled === 1 ? "" : "s"}. Falha ao salvar o resto — clique em Salvar pra continuar de onde parou.`,
      );
      setPhase("preview");
    }
  }

  function reset() {
    appliedRef.current = new Map();
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
        <ProgressPanel
          label="Lendo sua grade…"
          estimatedMs={14000}
          steps={[
            "Lendo o arquivo…",
            "Identificando as matérias…",
            "Extraindo dias e horários…",
            "Organizando a grade…",
          ]}
          hint={fileName ?? undefined}
        />
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
              // Já gravada no banco: um novo "Salvar" pula esta linha, então o
              // destino não pode continuar editável (mentiria pro aluno).
              const done = !!r.appliedKind && r.appliedKind !== "noop";
              return (
                <div
                  key={r.id}
                  className={cn(
                    "rounded-lg border border-border/70 bg-card/50 px-3 py-2.5 transition-opacity",
                    !r.selected && "opacity-50",
                  )}
                >
                  <div className="flex items-start gap-3">
                    <button
                      type="button"
                      onClick={() => toggleRow(r.id)}
                      disabled={done}
                      className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center disabled:cursor-not-allowed"
                      aria-label={r.selected ? "Desmarcar" : "Selecionar"}
                    >
                      {r.selected ? (
                        <CheckSquare className="h-4 w-4 text-primary" />
                      ) : (
                        <Square className="h-4 w-4 text-muted-foreground" />
                      )}
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5 text-sm font-medium leading-snug text-foreground">
                        <span className="min-w-0">{r.subject.name}</span>
                        {done && (
                          <span className="shrink-0 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
                            já salva
                          </span>
                        )}
                      </div>
                      {r.subject.schedule.length === 0 ? (
                        <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                          <Clock className="h-3 w-3 shrink-0" />
                          Sem horário detectado
                        </div>
                      ) : (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {mergeSlotsByDay(r.subject.schedule).map((d) => (
                            <span
                              key={d.day}
                              className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[11px] tabular-nums text-muted-foreground"
                            >
                              <span className="font-semibold text-foreground">
                                {DAY_LABELS_SHORT[d.day] ?? "?"}
                              </span>
                              {d.blocks
                                .map((b) => `${b.start}–${b.end}`)
                                .join(", ")}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="mt-2 flex items-center justify-end gap-2 pl-8">
                    {done ? (
                      <span className="text-[10px] text-muted-foreground">
                        gravada nesta sessão
                      </span>
                    ) : (
                      matchedExisting && (
                        <span className="text-[10px] text-muted-foreground">
                          substitui horário atual
                        </span>
                      )
                    )}
                    <select
                      value={r.target}
                      onChange={(e) => setRowTarget(r.id, e.target.value)}
                      disabled={done}
                      className={cn(
                        "h-8 min-w-0 max-w-[220px] flex-1 rounded border border-input bg-background px-1.5 text-[11px] sm:flex-none sm:w-44",
                        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                        "disabled:cursor-not-allowed disabled:opacity-60",
                      )}
                    >
                      <option value={NEW_SUBJECT}>+ Criar nova matéria</option>
                      {subjects.map((s) => (
                        <option key={s.id} value={s.id}>
                          Atualizar: {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {phase === "saving" && (
        <ProgressPanel label="Salvando agenda…" estimatedMs={4000} />
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
