"use client";

import { generateId } from "./utils";

/**
 * Eventos custom do calendário (blocos de estudo, provas, trabalhos, outros).
 * Persistência em localStorage — independente do db.ts pra não acoplar com Supabase.
 *
 * Aulas (`type: 'aula'`) NÃO ficam aqui — elas são expandidas a partir de
 * `subjects[].schedule` no próprio componente schedule. Mas o tipo aceita
 * `'aula'` por completude, caso queiramos no futuro permitir aulas avulsas.
 */

export type CalendarEventType = "aula" | "bloco" | "prova" | "trabalho" | "outro";

export type CalendarEvent = {
  id: string;
  user_id: string;
  type: CalendarEventType;
  title: string;
  subject_id?: string;
  starts_at: string; // ISO
  ends_at?: string; // ISO
  description?: string;
  created_at: string;
};

const STORAGE_KEY = (userId: string) => `lumio.calendar.events.${userId}`;

function read(userId: string): CalendarEvent[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as CalendarEvent[];
  } catch {
    return [];
  }
}

function write(userId: string, events: CalendarEvent[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY(userId), JSON.stringify(events));
  } catch (err) {
    console.error("[calendar-events] write failed", err);
  }
}

export async function listEventsAsync(userId: string): Promise<CalendarEvent[]> {
  const all = read(userId);
  // Ordena cronologicamente
  return all.sort(
    (a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime(),
  );
}

export async function addEventAsync(
  userId: string,
  data: {
    type: CalendarEventType;
    title: string;
    subject_id?: string;
    starts_at: string;
    ends_at?: string;
    description?: string;
  },
): Promise<CalendarEvent> {
  const all = read(userId);
  const event: CalendarEvent = {
    id: generateId(),
    user_id: userId,
    type: data.type,
    title: data.title.trim(),
    subject_id: data.subject_id,
    starts_at: data.starts_at,
    ends_at: data.ends_at,
    description: data.description?.trim() || undefined,
    created_at: new Date().toISOString(),
  };
  all.push(event);
  write(userId, all);
  return event;
}

export async function deleteEventAsync(
  userId: string,
  eventId: string,
): Promise<void> {
  const all = read(userId).filter((e) => e.id !== eventId);
  write(userId, all);
}

/**
 * Adiciona vários eventos de uma vez. Implementado como loop sobre addEventAsync
 * porque o storage é local — não precisa de transação. Retorna os eventos criados.
 */
export async function addEventsBulkAsync(
  userId: string,
  events: Array<{
    type: CalendarEventType;
    title: string;
    subject_id?: string;
    starts_at: string;
    ends_at?: string;
    description?: string;
  }>,
): Promise<CalendarEvent[]> {
  const created: CalendarEvent[] = [];
  for (const data of events) {
    const ev = await addEventAsync(userId, data);
    created.push(ev);
  }
  return created;
}

/**
 * Persiste um evento usando um ID externo (vindo do server, p.ex. tool
 * agendar_evento do Lumi). Idempotente: se já existe um evento com esse id
 * no localStorage, não duplica. Útil pra cards de "evento agendado" no chat
 * — re-renderização ou abrir histórico não cria duplicatas.
 */
export async function persistEventIdempotentAsync(
  userId: string,
  event: {
    id: string;
    type: CalendarEventType;
    title: string;
    subject_id?: string;
    starts_at: string;
    ends_at?: string;
    description?: string;
  },
): Promise<CalendarEvent> {
  const all = read(userId);
  const existing = all.find((e) => e.id === event.id);
  if (existing) return existing;
  const created: CalendarEvent = {
    id: event.id,
    user_id: userId,
    type: event.type,
    title: event.title.trim(),
    subject_id: event.subject_id,
    starts_at: event.starts_at,
    ends_at: event.ends_at,
    description: event.description?.trim() || undefined,
    created_at: new Date().toISOString(),
  };
  all.push(created);
  write(userId, all);
  return created;
}

export async function updateEventAsync(
  userId: string,
  eventId: string,
  patch: Partial<Omit<CalendarEvent, "id" | "user_id" | "created_at">>,
): Promise<CalendarEvent | null> {
  const all = read(userId);
  const idx = all.findIndex((e) => e.id === eventId);
  if (idx < 0) return null;
  all[idx] = { ...all[idx], ...patch };
  write(userId, all);
  return all[idx];
}

/* ---------------- helpers de cor/label por tipo ---------------- */

export const EVENT_TYPE_META: Record<
  CalendarEventType,
  { label: string; dot: string; bar: string; soft: string; text: string }
> = {
  aula: {
    label: "Aula",
    dot: "bg-primary",
    bar: "bg-primary",
    soft: "bg-primary/10",
    text: "text-primary",
  },
  bloco: {
    label: "Bloco de estudo",
    dot: "bg-blue-500",
    bar: "bg-blue-500",
    soft: "bg-blue-500/10",
    text: "text-blue-500",
  },
  prova: {
    label: "Prova",
    dot: "bg-red-500",
    bar: "bg-red-500",
    soft: "bg-red-500/10",
    text: "text-red-500",
  },
  trabalho: {
    label: "Trabalho",
    dot: "bg-amber-500",
    bar: "bg-amber-500",
    soft: "bg-amber-500/10",
    text: "text-amber-600 dark:text-amber-400",
  },
  outro: {
    label: "Outro",
    dot: "bg-emerald-500",
    bar: "bg-emerald-500",
    soft: "bg-emerald-500/10",
    text: "text-emerald-600 dark:text-emerald-400",
  },
};
