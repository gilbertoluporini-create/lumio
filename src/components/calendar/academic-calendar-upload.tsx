"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  CalendarDays,
  CheckSquare,
  FileText,
  Square,
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
import { addEventsBulkAsync } from "@/lib/calendar-events";
import {
  ACADEMIC_CATEGORY_META,
  formatEventDate,
  normalizeAcademicCalendar,
  normalizeAcademicEvents,
  type AcademicEvent,
  type AcademicEventCategory,
} from "@/lib/academic-calendar";
import { cn } from "@/lib/utils";

type ExtractResponse = {
  institution?: string | null;
  year?: number | null;
  events?: AcademicEvent[];
  error?: string;
  demo?: boolean;
  message?: string;
};

type Row = { id: string; selected: boolean; event: AcademicEvent };

const MONTH_LABELS = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

/**
 * Categorias marcadas por padrão: as que mudam a vida do aluno. Feriado,
 * recesso e evento institucional entram desmarcados pra não poluir a agenda
 * (o aluno marca se quiser).
 */
const DEFAULT_ON: AcademicEventCategory[] = ["prova", "nota", "prazo", "marco"];

export type AcademicCalendarUploadProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  onSaved?: () => void;
};

export function AcademicCalendarUpload({
  open,
  onOpenChange,
  userId,
  onSaved,
}: AcademicCalendarUploadProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        {open && (
          <AcademicCalendarUploadBody
            userId={userId}
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

function AcademicCalendarUploadBody({
  userId,
  onClose,
  onSaved,
}: {
  userId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<
    "idle" | "extracting" | "preview" | "saving"
  >("idle");
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [institution, setInstitution] = useState<string | null>(null);
  const [year, setYear] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [demoNote, setDemoNote] = useState(false);
  /**
   * Linhas que o addEventsBulkAsync JÁ gravou no localStorage. Se o PATCH do
   * perfil falhar depois disso, o phase volta pro preview e o aluno tenta de
   * novo — sem isso, o bulk rodaria outra vez sobre as mesmas linhas e cada
   * evento apareceria duplicado na agenda (addEventAsync não checa duplicata).
   */
  const persistedRowIdsRef = useRef<Set<string>>(new Set());

  const selectedCount = useMemo(
    () => rows.filter((r) => r.selected).length,
    [rows],
  );
  const allSelected = rows.length > 0 && selectedCount === rows.length;

  /** Agrupa por mês pra preview ficar legível (calendário tem ~60-90 eventos). */
  const grouped = useMemo(() => {
    const map = new Map<string, Row[]>();
    for (const r of rows) {
      const [y, m] = r.event.date.split("-");
      const key = `${y}-${m}`;
      const list = map.get(key);
      if (list) list.push(r);
      else map.set(key, [r]);
    }
    return Array.from(map.entries()).map(([key, items]) => {
      const [y, m] = key.split("-");
      return {
        key,
        label: `${MONTH_LABELS[Number(m) - 1] ?? key} ${y}`,
        items,
      };
    });
  }, [rows]);

  const handleFile = useCallback(async (file: File) => {
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
    const toastId = toast.loading("Lendo o calendário acadêmico…");

    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/extract-academic-calendar", {
        method: "POST",
        body: fd,
      });
      const data: ExtractResponse = await res
        .json()
        .catch(() => ({}) as ExtractResponse);

      if (!res.ok) {
        const msg = data?.error || "Falha ao processar o calendário.";
        toast.error(msg, { id: toastId });
        setError(msg);
        setPhase("idle");
        return;
      }

      const extracted = normalizeAcademicEvents(data.events);
      if (extracted.length === 0) {
        const msg = data?.error || "Não encontrei datas nesse calendário.";
        toast.message(msg, { id: toastId });
        setError(msg);
        setPhase("idle");
        return;
      }

      setRows(
        extracted.map((event, idx) => ({
          id: `${idx}`,
          selected: DEFAULT_ON.includes(event.category),
          event,
        })),
      );
      setInstitution(data.institution ?? null);
      setYear(data.year ?? null);
      setDemoNote(!!data.demo);
      setPhase("preview");
      toast.success(
        `${extracted.length} data${extracted.length === 1 ? "" : "s"} encontrada${extracted.length === 1 ? "" : "s"}.`,
        { id: toastId },
      );
    } catch (err) {
      console.error("[academic-calendar-upload] extract failed", err);
      const msg =
        err instanceof Error ? err.message : "Erro inesperado ao processar.";
      toast.error(msg, { id: toastId });
      setError(msg);
      setPhase("idle");
    }
  }, []);

  function toggleRow(id: string) {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, selected: !r.selected } : r)),
    );
  }

  function toggleAll() {
    const next = !allSelected;
    setRows((prev) => prev.map((r) => ({ ...r, selected: next })));
  }

  async function handleSave() {
    const chosen = rows.filter((r) => r.selected);
    setPhase("saving");
    try {
      // 1) Eventos escolhidos entram na agenda como eventos do calendário.
      //    Só o que ainda não foi commitado: uma tentativa anterior pode ter
      //    gravado essas linhas e falhado depois, no PATCH do perfil.
      const pending = chosen.filter(
        (r) => !persistedRowIdsRef.current.has(r.id),
      );
      if (pending.length > 0) {
        await addEventsBulkAsync(
          userId,
          pending.map((r) => {
            const meta = ACADEMIC_CATEGORY_META[r.event.category];
            // Evento acadêmico é "dia inteiro": 00:00 até 23:59 do último dia.
            const starts = new Date(`${r.event.date}T00:00:00`);
            const endIso = r.event.endDate ?? r.event.date;
            const ends = new Date(`${endIso}T23:59:00`);
            return {
              type: meta.eventType,
              title: r.event.title,
              starts_at: starts.toISOString(),
              ends_at: ends.toISOString(),
              description: `${meta.label} · calendário acadêmico${institution ? ` (${institution})` : ""}`,
            };
          }),
        );
        for (const r of pending) persistedRowIdsRef.current.add(r.id);
      }

      // 2) O calendário INTEIRO (inclusive o não marcado) vai pro perfil —
      //    é o que parametriza a Lumi: ela passa a saber recesso, feriado e
      //    prazo mesmo que o aluno não queira o evento poluindo a agenda.
      //
      //    Antes de gravar, LÊ o que já está salvo e FUNDE: o PATCH substitui a
      //    coluna jsonb inteira (user-profile.ts: `row.academic_calendar =
      //    patch.academicCalendar ?? null`), então sem o merge subir o
      //    calendário do 2º semestre APAGA o do 1º — as aulas de fev-jun somem
      //    atrás do banner "Fora do período letivo" (getTermWindows passa a ver
      //    só a janela nova) e os feriados antigos param de suprimir aula.
      let previous: AcademicEvent[] = [];
      let prevInstitution: string | null = null;
      let prevYear: number | null = null;
      try {
        const curRes = await fetch("/api/user-profile");
        if (!curRes.ok) {
          throw new Error(`GET /api/user-profile ${curRes.status}`);
        }
        const cur = await curRes.json();
        const prevCal = normalizeAcademicCalendar(cur?.profile?.academicCalendar);
        if (prevCal) {
          previous = prevCal.events;
          prevInstitution = prevCal.institution ?? null;
          prevYear = prevCal.year ?? null;
        }
      } catch (readErr) {
        // Falha na leitura NÃO pode virar sobrescrita silenciosa: aborta o
        // PATCH e avisa, em vez de gravar só o calendário novo por cima do que
        // já existia.
        console.error("[academic-calendar-upload] profile read failed", readErr);
        toast.warning(
          "Não consegui ler seu calendário atual. As datas foram pra agenda, mas não sobrescrevi o calendário salvo.",
        );
        onSaved();
        return;
      }

      // `normalizeAcademicEvents` ordena por data e deduplica por `date|title`
      // mantendo a PRIMEIRA ocorrência. Com os novos NA FRENTE, re-subir um PDF
      // corrigido atualiza a linha antiga (e o salvo bate com a preview que o
      // aluno acabou de conferir); re-subir o MESMO PDF continua idempotente.
      const mergedEvents = normalizeAcademicEvents([
        ...rows.map((r) => r.event),
        ...previous,
      ]);
      // O zod da rota rejeita o request inteiro (400) acima de 300 eventos.
      // `slice(-300)` mantém as datas mais recentes da lista já ordenada.
      const MAX_EVENTS = 300;
      const cappedEvents = mergedEvents.slice(-MAX_EVENTS);
      const dropped = mergedEvents.length - cappedEvents.length;
      if (dropped > 0) {
        toast.warning(
          `Seu calendário passou de ${MAX_EVENTS} datas: guardei as mais recentes e descartei ${dropped} data${dropped === 1 ? "" : "s"} antiga${dropped === 1 ? "" : "s"}.`,
        );
      }

      const profileRes = await fetch("/api/user-profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          academicCalendar: {
            // Não zera o que já estava salvo quando a extração nova não
            // identifica instituição/ano.
            institution: institution ?? prevInstitution,
            year: year ?? prevYear,
            sourceFile: fileName,
            importedAt: new Date().toISOString(),
            events: cappedEvents,
          },
        }),
      });
      if (!profileRes.ok) {
        // Agenda já foi salva; avisa que só o contexto da Lumi falhou.
        console.error(
          "[academic-calendar-upload] profile patch failed",
          profileRes.status,
        );
        toast.warning(
          "Datas adicionadas na agenda, mas não consegui salvar o contexto da Lumi. Tente subir de novo mais tarde.",
        );
        onSaved();
        return;
      }

      toast.success(
        chosen.length > 0
          ? `${chosen.length} data${chosen.length === 1 ? "" : "s"} na agenda. A Lumi já conhece seu calendário.`
          : "Calendário salvo. A Lumi já conhece suas datas.",
      );
      onSaved();
    } catch (err) {
      console.error("[academic-calendar-upload] save failed", err);
      toast.error("Falha ao salvar. Tente novamente.");
      setPhase("preview");
    }
  }

  function reset() {
    // Arquivo novo repopula as linhas reusando os mesmos ids (`${idx}`) —
    // sem limpar aqui, uma falha anterior faria o save pular linhas erradas.
    persistedRowIdsRef.current.clear();
    setRows([]);
    setFileName(null);
    setInstitution(null);
    setYear(null);
    setError(null);
    setDemoNote(false);
    setPhase("idle");
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Subir calendário acadêmico</DialogTitle>
        <DialogDescription>
          Envie o PDF do calendário oficial da sua faculdade. A IA extrai
          provas, entrega de notas, prazos, feriados e recessos — e a Lumi passa
          a considerar essas datas quando montar seu plano de estudos.
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
            <CalendarDays className="h-8 w-8 text-muted-foreground" />
            <div className="text-sm font-medium">
              Clique pra selecionar o PDF ou imagem
            </div>
            <div className="text-xs text-muted-foreground">
              Calendário acadêmico do semestre ou do ano (máx 10MB)
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
          label="Lendo o calendário…"
          estimatedMs={26000}
          steps={[
            "Lendo o arquivo…",
            "Identificando os meses…",
            "Extraindo provas e prazos…",
            "Separando feriados e recessos…",
            "Organizando por data…",
          ]}
          hint="Calendário do ano inteiro leva alguns segundos."
        />
      )}

      {phase === "preview" && (
        <div className="space-y-3">
          {demoNote && (
            <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
              <AlertCircle className="h-4 w-4 shrink-0" />
              Modo demo (sem ANTHROPIC_API_KEY). Datas fictícias pra teste.
            </div>
          )}

          <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <div className="flex min-w-0 items-center gap-2">
              {fileName && (
                <span className="inline-flex min-w-0 items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate max-w-[180px]">{fileName}</span>
                </span>
              )}
              <button
                type="button"
                onClick={reset}
                className="shrink-0 text-primary hover:underline"
              >
                trocar arquivo
              </button>
            </div>
            <button
              type="button"
              onClick={toggleAll}
              className="inline-flex shrink-0 items-center gap-1.5 rounded px-1.5 py-0.5 transition-colors hover:bg-accent"
            >
              {allSelected ? (
                <CheckSquare className="h-3.5 w-3.5" />
              ) : (
                <Square className="h-3.5 w-3.5" />
              )}
              {allSelected ? "Desmarcar todas" : "Marcar todas"}
            </button>
          </div>

          {(institution || year) && (
            <div className="rounded-md border border-border/70 bg-card/50 px-3 py-2 text-xs">
              <span className="text-muted-foreground">Identificado: </span>
              <span className="font-medium text-foreground">
                {institution ?? "instituição não identificada"}
                {year ? ` · ${year}` : ""}
              </span>
            </div>
          )}

          <div className="max-h-[46vh] space-y-3 overflow-y-auto pr-1">
            {grouped.map((g) => (
              <div key={g.key}>
                <div className="sticky top-0 z-10 bg-background/95 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur">
                  {g.label}
                </div>
                <div className="space-y-1.5">
                  {g.items.map((r) => {
                    const meta = ACADEMIC_CATEGORY_META[r.event.category];
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => toggleRow(r.id)}
                        className={cn(
                          "flex w-full items-start gap-3 rounded-lg border border-border/70 bg-card/50 px-3 py-2 text-left transition-opacity",
                          !r.selected && "opacity-45",
                        )}
                      >
                        <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
                          {r.selected ? (
                            <CheckSquare className="h-4 w-4 text-primary" />
                          ) : (
                            <Square className="h-4 w-4 text-muted-foreground" />
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-foreground">
                            {r.event.title}
                          </span>
                          <span className="mt-0.5 block text-[11px] text-muted-foreground">
                            {formatEventDate(r.event)}
                          </span>
                        </span>
                        <span
                          className={cn(
                            "shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium",
                            meta.tone,
                          )}
                        >
                          {meta.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <p className="text-[11px] text-muted-foreground">
            As datas marcadas entram na sua agenda. O calendário completo fica
            salvo pra Lumi consultar, mesmo o que você não marcar.
          </p>
        </div>
      )}

      {phase === "saving" && (
        <ProgressPanel
          label="Salvando calendário…"
          estimatedMs={5000}
          steps={["Adicionando na agenda…", "Ensinando as datas pra Lumi…"]}
        />
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
          <Button type="button" variant="gradient" onClick={handleSave}>
            {selectedCount > 0
              ? `Salvar ${selectedCount} data${selectedCount === 1 ? "" : "s"}`
              : "Salvar só pra Lumi"}
          </Button>
        )}
      </DialogFooter>
    </>
  );
}
