"use client";

import { createElement, useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  Calendar,
  Clock,
  ExternalLink,
  FileText,
  GraduationCap,
  Loader2,
  MapPin,
  Pencil,
  Sparkles,
  Tag,
  Trash2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { confirmAction } from "@/components/ui/confirm-dialog";
import { toast } from "sonner";
import {
  EVENT_TYPE_META,
  deleteEventAsync,
  type CalendarEventType,
} from "@/lib/calendar-events";
import { cn } from "@/lib/utils";

/* ---------------- types ---------------- */

export type DetailsEvent = {
  id: string;
  type: CalendarEventType;
  date: Date;
  startTime: string;
  endTime: string;
  title: string;
  subjectId?: string;
  subjectName?: string;
  subjectColor?: string;
  room?: string;
  description?: string;
  /**
   * true quando o evento NÃO vem do storage de eventos custom (é uma aula
   * expandida de subject.schedule). Nestes casos não dá pra editar/excluir
   * direto — escondemos os botões de ação destrutiva.
   */
  readOnly?: boolean;
};

export type EventDetailsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event: DetailsEvent | null;
  userId: string;
  onEdit?: (event: DetailsEvent) => void;
  onDeleted?: (eventId: string) => void;
};

/* ---------------- helpers ---------------- */

function getTypeIcon(type: CalendarEventType): LucideIcon {
  switch (type) {
    case "aula":
      return GraduationCap;
    case "bloco":
      return BookOpen;
    case "prova":
      return FileText;
    case "trabalho":
      return Sparkles;
    case "outro":
      return Tag;
  }
}

const MONTHS_LONG = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

const WEEKDAYS_LONG = [
  "domingo",
  "segunda-feira",
  "terça-feira",
  "quarta-feira",
  "quinta-feira",
  "sexta-feira",
  "sábado",
];

function formatFullDate(d: Date): string {
  return `${WEEKDAYS_LONG[d.getDay()]}, ${d.getDate()} de ${MONTHS_LONG[d.getMonth()]} de ${d.getFullYear()}`;
}

/* ---------------- component ---------------- */

export function EventDetailsDialog({
  open,
  onOpenChange,
  event,
  userId,
  onEdit,
  onDeleted,
}: EventDetailsDialogProps) {
  const [deleting, setDeleting] = useState(false);

  if (!event) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md" />
      </Dialog>
    );
  }

  const meta = EVENT_TYPE_META[event.type];
  const Icon = getTypeIcon(event.type);
  const hasTimeRange =
    event.startTime && event.endTime && event.startTime !== event.endTime;

  async function handleDelete() {
    if (!event) return;
    if (event.readOnly) {
      toast.error("Esta aula vem da grade da matéria — edite na matéria.");
      return;
    }
    const ok = await confirmAction({
      title: `Excluir "${event.title}"?`,
      description: "Essa ação não pode ser desfeita.",
      destructive: true,
      confirmText: "Excluir evento",
    });
    if (!ok) return;
    setDeleting(true);
    try {
      await deleteEventAsync(userId, event.id);
      toast.success("Evento excluído.");
      onDeleted?.(event.id);
      onOpenChange(false);
    } catch (err) {
      console.error("[event-details] delete failed", err);
      toast.error("Falha ao excluir. Tente novamente.");
    } finally {
      setDeleting(false);
    }
  }

  function handleEdit() {
    if (!event) return;
    if (event.readOnly) {
      toast.error("Esta aula vem da grade da matéria — edite na matéria.");
      return;
    }
    onEdit?.(event);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <div
              className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white",
                event.subjectColor
                  ? cn("bg-gradient-to-br", event.subjectColor)
                  : meta.bar,
              )}
            >
              {createElement(Icon, { className: "h-5 w-5" })}
            </div>
            <div className="min-w-0 flex-1">
              <DialogTitle className="leading-tight">{event.title}</DialogTitle>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                    meta.soft,
                    meta.text,
                  )}
                >
                  <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />
                  {meta.label}
                </span>
                {event.readOnly && (
                  <span className="inline-flex items-center rounded-full border border-border bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    da grade
                  </span>
                )}
              </div>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="flex items-start gap-2">
            <Calendar className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
            <div className="text-foreground capitalize">
              {formatFullDate(event.date)}
            </div>
          </div>

          <div className="flex items-start gap-2">
            <Clock className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
            <div className="text-foreground tabular-nums">
              {hasTimeRange
                ? `${event.startTime} – ${event.endTime}`
                : event.startTime}
            </div>
          </div>

          {event.room && (
            <div className="flex items-start gap-2">
              <MapPin className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
              <div className="text-foreground">{event.room}</div>
            </div>
          )}

          {event.subjectName && event.subjectId && (
            <div className="flex items-start gap-2">
              <BookOpen className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
              <Link
                href={`/subject/${event.subjectId}`}
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                {event.subjectName}
                <ExternalLink className="h-3 w-3" />
              </Link>
            </div>
          )}

          {event.description && (
            <div className="rounded-md border border-border/60 bg-background/50 p-3">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 font-medium">
                Descrição
              </div>
              <p className="text-sm text-foreground whitespace-pre-wrap">
                {event.description}
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          {!event.readOnly && (
            <>
              <Button
                type="button"
                variant="destructive"
                onClick={handleDelete}
                disabled={deleting}
              >
                {deleting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                Excluir
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleEdit}
                disabled={deleting}
              >
                <Pencil className="h-4 w-4" />
                Editar
              </Button>
            </>
          )}
          <Button
            type="button"
            variant={event.readOnly ? "outline" : "gradient"}
            onClick={() => onOpenChange(false)}
            disabled={deleting}
          >
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
