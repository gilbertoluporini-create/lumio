"use client";

import { useMemo, useState } from "react";
import { BookOpen, FileText, GraduationCap, Loader2, Sparkles, Tag } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import {
  addEventAsync,
  EVENT_TYPE_META,
  updateEventAsync,
  type CalendarEvent,
  type CalendarEventType,
} from "@/lib/calendar-events";
import type { Subject } from "@/lib/types";
import { cn } from "@/lib/utils";

const TYPE_OPTIONS: Array<{
  value: CalendarEventType;
  label: string;
  Icon: typeof BookOpen;
}> = [
  { value: "bloco", label: "Bloco de estudo", Icon: BookOpen },
  { value: "prova", label: "Prova", Icon: FileText },
  { value: "trabalho", label: "Trabalho", Icon: Sparkles },
  { value: "aula", label: "Aula avulsa", Icon: GraduationCap },
  { value: "outro", label: "Outro", Icon: Tag },
];

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function defaultStartTime(): string {
  const d = new Date();
  // Próximo "round hour" — se já passou de 30, sobe pra hora seguinte
  const hour = d.getMinutes() >= 30 ? d.getHours() + 1 : d.getHours();
  const h = Math.min(23, Math.max(0, hour));
  return `${pad2(h)}:00`;
}

function addOneHour(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const next = (h + 1) % 24;
  return `${pad2(next)}:${pad2(m || 0)}`;
}

function combineDateTimeISO(date: string, time: string): string {
  // date = "YYYY-MM-DD", time = "HH:MM" — interpreta como local time
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const dt = new Date(y, mo - 1, d, h, mi, 0, 0);
  return dt.toISOString();
}

export type EventFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  subjects: Subject[];
  defaultDate?: Date; // pré-popula a data
  defaultType?: CalendarEventType;
  /**
   * Quando passado, o dialog entra em modo edição: pré-popula com os valores
   * do evento e chama updateEventAsync no submit (em vez de addEventAsync).
   */
  editEvent?: CalendarEvent | null;
  onCreated?: (event: CalendarEvent) => void;
  onUpdated?: (event: CalendarEvent) => void;
};

export function EventFormDialog({
  open,
  onOpenChange,
  userId,
  subjects,
  defaultDate,
  defaultType = "bloco",
  editEvent = null,
  onCreated,
  onUpdated,
}: EventFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        {/*
          Re-mount o form sempre que reabrir → useState initializers rodam de novo
          com defaults frescos, sem precisar de useEffect+setState.
        */}
        {open && (
          <EventFormBody
            key={
              editEvent
                ? `edit-${editEvent.id}`
                : `${defaultDate?.toISOString() ?? "today"}-${defaultType}`
            }
            userId={userId}
            subjects={subjects}
            defaultDate={defaultDate}
            defaultType={defaultType}
            editEvent={editEvent}
            onCancel={() => onOpenChange(false)}
            onCreated={(ev) => {
              onCreated?.(ev);
              onOpenChange(false);
            }}
            onUpdated={(ev) => {
              onUpdated?.(ev);
              onOpenChange(false);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function EventFormBody({
  userId,
  subjects,
  defaultDate,
  defaultType,
  editEvent,
  onCancel,
  onCreated,
  onUpdated,
}: {
  userId: string;
  subjects: Subject[];
  defaultDate?: Date;
  defaultType: CalendarEventType;
  editEvent: CalendarEvent | null;
  onCancel: () => void;
  onCreated: (ev: CalendarEvent) => void;
  onUpdated: (ev: CalendarEvent) => void;
}) {
  const isEdit = !!editEvent;

  const initialDate = useMemo(() => {
    if (editEvent) {
      const dt = new Date(editEvent.starts_at);
      return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
    }
    if (defaultDate) {
      return `${defaultDate.getFullYear()}-${pad2(defaultDate.getMonth() + 1)}-${pad2(defaultDate.getDate())}`;
    }
    return todayISO();
  }, [defaultDate, editEvent]);

  const initialStart = useMemo(() => {
    if (editEvent) {
      const dt = new Date(editEvent.starts_at);
      return `${pad2(dt.getHours())}:${pad2(dt.getMinutes())}`;
    }
    return defaultStartTime();
  }, [editEvent]);

  const initialEnd = useMemo(() => {
    if (editEvent?.ends_at) {
      const dt = new Date(editEvent.ends_at);
      return `${pad2(dt.getHours())}:${pad2(dt.getMinutes())}`;
    }
    return addOneHour(initialStart);
  }, [editEvent, initialStart]);

  const [type, setType] = useState<CalendarEventType>(
    editEvent?.type ?? defaultType,
  );
  const [title, setTitle] = useState(editEvent?.title ?? "");
  const [subjectId, setSubjectId] = useState<string>(
    editEvent?.subject_id ?? "",
  );
  const [date, setDate] = useState<string>(initialDate);
  const [startTime, setStartTime] = useState<string>(initialStart);
  const [endTime, setEndTime] = useState<string>(initialEnd);
  const [description, setDescription] = useState(editEvent?.description ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      setError("Dá um título pro compromisso.");
      return;
    }
    if (!date) {
      setError("Escolhe uma data.");
      return;
    }
    if (!startTime) {
      setError("Escolhe um horário de início.");
      return;
    }
    if (endTime && endTime <= startTime) {
      setError("O horário de término precisa ser depois do início.");
      return;
    }

    setSaving(true);
    try {
      const startsAt = combineDateTimeISO(date, startTime);
      const endsAt = endTime ? combineDateTimeISO(date, endTime) : undefined;
      const payload = {
        type,
        title: cleanTitle,
        subject_id: subjectId || undefined,
        starts_at: startsAt,
        ends_at: endsAt,
        description: description.trim() || undefined,
      };

      if (isEdit && editEvent) {
        const updated = await updateEventAsync(userId, editEvent.id, payload);
        if (!updated) {
          setError("Evento não encontrado.");
          return;
        }
        onUpdated(updated);
      } else {
        const created = await addEventAsync(userId, payload);
        onCreated(created);
      }
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {isEdit ? "Editar compromisso" : "Novo compromisso"}
        </DialogTitle>
        <DialogDescription>
          {isEdit
            ? "Atualize os dados do compromisso."
            : "Adicione blocos de estudo, provas ou trabalhos ao seu calendário."}
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={handleSubmit} className="space-y-4">
          {/* Tipo (pill selector) */}
          <div className="space-y-1.5">
            <Label>Categoria</Label>
            <div className="flex flex-wrap gap-1.5">
              {TYPE_OPTIONS.map((opt) => {
                const meta = EVENT_TYPE_META[opt.value];
                const active = type === opt.value;
                const Icon = opt.Icon;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setType(opt.value)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                      active
                        ? cn(meta.soft, "border-current", meta.text)
                        : "border-border bg-background text-muted-foreground hover:text-foreground hover:bg-accent",
                    )}
                  >
                    <span className={cn("h-2 w-2 rounded-full", meta.dot)} />
                    <Icon className="h-3 w-3" />
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Título */}
          <div className="space-y-1.5">
            <Label htmlFor="event-title">Título</Label>
            <Input
              id="event-title"
              placeholder="Ex: Revisão de Cardiologia"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
              maxLength={120}
            />
          </div>

          {/* Matéria (opcional) */}
          {subjects.length > 0 && (
            <div className="space-y-1.5">
              <Label htmlFor="event-subject">Matéria (opcional)</Label>
              <select
                id="event-subject"
                value={subjectId}
                onChange={(e) => setSubjectId(e.target.value)}
                className={cn(
                  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background focus-visible:border-ring",
                )}
              >
                <option value="">— Sem matéria —</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Data + Horários */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1.5 sm:col-span-1">
              <Label htmlFor="event-date">Data</Label>
              <Input
                id="event-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-1">
              <Label htmlFor="event-start">Início</Label>
              <Input
                id="event-start"
                type="time"
                value={startTime}
                onChange={(e) => {
                  setStartTime(e.target.value);
                  if (e.target.value && (!endTime || endTime <= e.target.value)) {
                    setEndTime(addOneHour(e.target.value));
                  }
                }}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-1">
              <Label htmlFor="event-end">Fim</Label>
              <Input
                id="event-end"
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
            </div>
          </div>

          {/* Descrição */}
          <div className="space-y-1.5">
            <Label htmlFor="event-desc">Descrição (opcional)</Label>
            <Textarea
              id="event-desc"
              placeholder="Tópicos, prazos, observações…"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={500}
            />
          </div>

          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button type="submit" variant="gradient" disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Salvando…
                </>
              ) : isEdit ? (
                "Salvar alterações"
              ) : (
                "Salvar compromisso"
              )}
            </Button>
          </DialogFooter>
        </form>
    </>
  );
}
