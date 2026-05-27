"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  CheckSquare,
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
import {
  EVENT_TYPE_META,
  addEventsBulkAsync,
  type CalendarEventType,
} from "@/lib/calendar-events";
import type { Subject } from "@/lib/types";
import { cn } from "@/lib/utils";
import { LIMITS, PDF_LIMIT_MB } from "@/lib/api-security";

/* ---------------- types ---------------- */

type ExtractedEventType = "prova" | "trabalho" | "aula" | "bloco" | "outro";

type ExtractedEvent = {
  date: string; // "YYYY-MM-DD"
  title: string;
  type: ExtractedEventType;
  startTime?: string;
  endTime?: string;
  subjectGuess?: string;
  description?: string;
};

type ExtractResponse = {
  events?: ExtractedEvent[];
  error?: string;
  demo?: boolean;
};

type PreviewRow = {
  id: string; // index estável
  selected: boolean;
  event: ExtractedEvent;
  matchedSubjectId?: string;
};

export type ExamPdfUploadProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  subjects: Subject[];
  onCreated?: () => void;
};

/* ---------------- pdfjs lazy loader ---------------- */

let pdfjsWorkerConfigured = false;
async function getPdfJs() {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  if (!pdfjsWorkerConfigured && typeof window !== "undefined") {
    pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.legacy.mjs";
    pdfjsWorkerConfigured = true;
  }
  return pdfjs;
}

async function extractPdfText(file: File): Promise<string> {
  const pdfjs = await getPdfJs();
  const buf = await file.arrayBuffer();
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(buf) });
  const doc = await loadingTask.promise;
  const parts: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((it) => ("str" in it ? it.str : ""))
      .filter((s) => s.length > 0)
      .join(" ");
    if (pageText.trim().length > 0) {
      parts.push(`--- Página ${i} ---\n${pageText}`);
    }
    page.cleanup();
  }
  await doc.destroy();
  return parts.join("\n\n");
}

/* ---------------- subject matching ---------------- */

/**
 * Normaliza string pra matching fuzzy: lowercase + remove acentos + colapsa espaços.
 */
function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function findSubjectMatch(
  guess: string | undefined,
  subjects: Subject[],
): string | undefined {
  if (!guess) return undefined;
  const g = normalize(guess);
  if (g.length === 0) return undefined;

  // 1. Match exato (normalized)
  const exact = subjects.find((s) => normalize(s.name) === g);
  if (exact) return exact.id;

  // 2. Match por inclusão (subject name contém guess ou vice-versa)
  const contains = subjects.find((s) => {
    const n = normalize(s.name);
    return n.includes(g) || g.includes(n);
  });
  if (contains) return contains.id;

  // 3. Match por primeira palavra significativa (>=4 chars)
  const guessWords = g.split(/\s+/).filter((w) => w.length >= 4);
  if (guessWords.length > 0) {
    const wordMatch = subjects.find((s) => {
      const n = normalize(s.name);
      return guessWords.some((w) => n.includes(w));
    });
    if (wordMatch) return wordMatch.id;
  }

  return undefined;
}

/* ---------------- date/time formatting ---------------- */

const WEEKDAYS_SHORT = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

function formatDate(dateISO: string): string {
  const [y, m, d] = dateISO.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const wd = WEEKDAYS_SHORT[dt.getDay()];
  return `${wd} ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
}

function combineDateTimeISO(date: string, time: string): string {
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const dt = new Date(y, mo - 1, d, h, mi, 0, 0);
  return dt.toISOString();
}

function defaultIsoFor(date: string, hour: number): string {
  const [y, mo, d] = date.split("-").map(Number);
  const dt = new Date(y, mo - 1, d, hour, 0, 0, 0);
  return dt.toISOString();
}

/* ---------------- main component ---------------- */

export function ExamPdfUpload({
  open,
  onOpenChange,
  userId,
  subjects,
  onCreated,
}: ExamPdfUploadProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        {open && (
          <ExamPdfUploadBody
            userId={userId}
            subjects={subjects}
            onClose={() => onOpenChange(false)}
            onCreated={() => {
              onCreated?.();
              onOpenChange(false);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ExamPdfUploadBody({
  userId,
  subjects,
  onClose,
  onCreated,
}: {
  userId: string;
  subjects: Subject[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<
    "idle" | "extracting" | "preview" | "saving"
  >("idle");
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [demoNote, setDemoNote] = useState<boolean>(false);

  const selectedCount = useMemo(
    () => rows.filter((r) => r.selected).length,
    [rows],
  );
  const allSelected = rows.length > 0 && selectedCount === rows.length;

  const handleFile = useCallback(
    async (file: File) => {
      setError(null);
      setDemoNote(false);

      if (file.type !== "application/pdf") {
        const msg = "Envie um arquivo PDF.";
        setError(msg);
        toast.error(msg);
        return;
      }
      if (file.size > LIMITS.PDF_BYTES) {
        const msg = `PDF muito grande (máx ${PDF_LIMIT_MB}MB).`;
        setError(msg);
        toast.error(msg);
        return;
      }

      setFileName(file.name);
      setPhase("extracting");
      const toastId = toast.loading("Lendo PDF localmente…");

      try {
        const text = await extractPdfText(file);
        if (text.trim().length < 50) {
          toast.error("PDF sem texto extraível (talvez seja só imagem).", {
            id: toastId,
          });
          setError(
            "Não consegui ler texto deste PDF. Se for um scan/imagem, tente outro arquivo.",
          );
          setPhase("idle");
          return;
        }

        toast.loading("Identificando eventos com IA…", { id: toastId });

        const res = await fetch("/api/calendar/extract-pdf", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text,
            subjectNames: subjects.map((s) => s.name),
          }),
        });

        const data: ExtractResponse = await res
          .json()
          .catch(() => ({}) as ExtractResponse);

        if (!res.ok) {
          const msg = data?.error || "Falha ao extrair eventos.";
          toast.error(msg, { id: toastId });
          setError(msg);
          setPhase("idle");
          return;
        }

        const events = Array.isArray(data.events) ? data.events : [];
        if (events.length === 0) {
          toast.message("Nenhum evento identificado no PDF.", { id: toastId });
          setError(
            data.error ||
              "Nenhum evento detectado. Tente um PDF com datas mais claras.",
          );
          setPhase("idle");
          return;
        }

        const previewRows: PreviewRow[] = events.map((ev, idx) => ({
          id: `${idx}`,
          selected: true,
          event: ev,
          matchedSubjectId: findSubjectMatch(ev.subjectGuess, subjects),
        }));

        setRows(previewRows);
        setDemoNote(!!data.demo);
        setPhase("preview");
        toast.success(
          `${events.length} evento${events.length === 1 ? "" : "s"} identificado${events.length === 1 ? "" : "s"}.`,
          { id: toastId },
        );
      } catch (err) {
        console.error("[exam-pdf-upload] extract failed", err);
        const msg =
          err instanceof Error
            ? err.message
            : "Erro inesperado ao processar PDF.";
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
    const newVal = !allSelected;
    setRows((prev) => prev.map((r) => ({ ...r, selected: newVal })));
  }

  function setRowSubject(id: string, subjectId: string) {
    setRows((prev) =>
      prev.map((r) =>
        r.id === id ? { ...r, matchedSubjectId: subjectId || undefined } : r,
      ),
    );
  }

  async function handleSave() {
    const toCreate = rows.filter((r) => r.selected);
    if (toCreate.length === 0) {
      toast.error("Selecione pelo menos um evento.");
      return;
    }

    setPhase("saving");
    try {
      const payload = toCreate.map((r) => {
        const ev = r.event;
        const starts_at = ev.startTime
          ? combineDateTimeISO(ev.date, ev.startTime)
          : defaultIsoFor(ev.date, 8);
        const ends_at = ev.endTime
          ? combineDateTimeISO(ev.date, ev.endTime)
          : ev.startTime
            ? combineDateTimeISO(ev.date, addOneHour(ev.startTime))
            : defaultIsoFor(ev.date, 9);

        // Mapeia tipo extraído pro CalendarEventType local (idênticos).
        const type: CalendarEventType = ev.type;
        return {
          type,
          title: ev.title,
          subject_id: r.matchedSubjectId,
          starts_at,
          ends_at,
          description: ev.description,
        };
      });

      await addEventsBulkAsync(userId, payload);
      toast.success(
        `${toCreate.length} evento${toCreate.length === 1 ? "" : "s"} adicionado${toCreate.length === 1 ? "" : "s"} ao calendário.`,
      );
      onCreated();
    } catch (err) {
      console.error("[exam-pdf-upload] save failed", err);
      toast.error("Falha ao salvar eventos. Tente novamente.");
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
        <DialogTitle>Upload calendário de provas</DialogTitle>
        <DialogDescription>
          Envie o PDF do calendário acadêmico — a IA identifica as datas de
          provas, trabalhos e entregas pra adicionar de uma vez.
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
              Clique pra selecionar um PDF
            </div>
            <div className="text-xs text-muted-foreground">
              Calendário acadêmico, plano de ensino, cronograma de provas… (máx
              50MB)
            </div>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              // Reset pra permitir reupload do mesmo arquivo
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
          <div className="text-sm font-medium">Processando PDF…</div>
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
              Modo demo (sem ANTHROPIC_API_KEY). Eventos fictícios pra teste.
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
                trocar PDF
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
              {allSelected ? "Desmarcar todos" : "Marcar todos"}
            </button>
          </div>

          <div className="max-h-[50vh] overflow-y-auto rounded-md border border-border/70">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-card border-b border-border/60">
                <tr className="text-left text-muted-foreground">
                  <th className="px-2 py-2 w-8"></th>
                  <th className="px-2 py-2 w-24">Data</th>
                  <th className="px-2 py-2">Título</th>
                  <th className="px-2 py-2 w-24">Tipo</th>
                  <th className="px-2 py-2 w-40">Matéria</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {rows.map((r) => {
                  const meta = EVENT_TYPE_META[r.event.type];
                  return (
                    <tr
                      key={r.id}
                      className={cn(
                        "hover:bg-accent/30 transition-colors",
                        !r.selected && "opacity-50",
                      )}
                    >
                      <td className="px-2 py-2">
                        <button
                          type="button"
                          onClick={() => toggleRow(r.id)}
                          className="flex h-5 w-5 items-center justify-center"
                          aria-label={
                            r.selected ? "Desmarcar evento" : "Selecionar evento"
                          }
                        >
                          {r.selected ? (
                            <CheckSquare className="h-4 w-4 text-primary" />
                          ) : (
                            <Square className="h-4 w-4 text-muted-foreground" />
                          )}
                        </button>
                      </td>
                      <td className="px-2 py-2 tabular-nums text-foreground">
                        <div>{formatDate(r.event.date)}</div>
                        {r.event.startTime && (
                          <div className="text-[10px] text-muted-foreground">
                            {r.event.startTime}
                            {r.event.endTime && `–${r.event.endTime}`}
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-2">
                        <div className="font-medium text-foreground truncate max-w-[260px]">
                          {r.event.title}
                        </div>
                        {r.event.description && (
                          <div className="text-[10px] text-muted-foreground line-clamp-1 max-w-[260px]">
                            {r.event.description}
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-2">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                            meta.soft,
                            meta.text,
                          )}
                        >
                          <span
                            className={cn("h-1.5 w-1.5 rounded-full", meta.dot)}
                          />
                          {meta.label}
                        </span>
                      </td>
                      <td className="px-2 py-2">
                        {subjects.length > 0 ? (
                          <select
                            value={r.matchedSubjectId ?? ""}
                            onChange={(e) =>
                              setRowSubject(r.id, e.target.value)
                            }
                            className={cn(
                              "h-7 w-full rounded border border-input bg-background px-1.5 text-[11px]",
                              "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                            )}
                          >
                            <option value="">— sem matéria —</option>
                            {subjects.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.name}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-muted-foreground text-[10px]">
                            —
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {phase === "saving" && (
        <div className="flex flex-col items-center justify-center gap-3 py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <div className="text-sm font-medium">Salvando eventos…</div>
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
            Adicionar {selectedCount} evento{selectedCount === 1 ? "" : "s"}{" "}
            selecionado{selectedCount === 1 ? "" : "s"}
          </Button>
        )}
      </DialogFooter>
    </>
  );
}

/* ---------------- small helpers ---------------- */

function addOneHour(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const next = (h + 1) % 24;
  return `${String(next).padStart(2, "0")}:${String(m || 0).padStart(2, "0")}`;
}
