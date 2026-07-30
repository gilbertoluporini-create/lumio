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

/**
 * Erro de persistência do calendário. Existe pra que os callers (dialog de
 * compromisso, uploads) consigam distinguir "não gravou" de qualquer outra
 * falha — e pra mensagem já sair pronta pro aluno, já que o
 * event-form-dialog joga o `err.message` direto na tela.
 */
export class CalendarStorageError extends Error {
  // `cause` por atribuição (e não `super(msg, { cause })`) porque o target é
  // ES2017 e o 2º argumento do Error só existe a partir do ES2022 em runtime.
  cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.cause = cause;
    this.name = "CalendarStorageError";
  }
}

/**
 * Quota estourada tem nome/código diferente por navegador: Chrome usa
 * `QuotaExceededError` (code 22), Firefox `NS_ERROR_DOM_QUOTA_REACHED`
 * (code 1014) e o Safari em navegação privada estoura já na 1ª gravação.
 */
function isQuotaError(err: unknown): boolean {
  if (typeof DOMException !== "undefined" && err instanceof DOMException) {
    return (
      err.name === "QuotaExceededError" ||
      err.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
      err.code === 22 ||
      err.code === 1014
    );
  }
  return err instanceof Error && /quota/i.test(err.name + err.message);
}

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

/**
 * Grava a lista inteira. PROPAGA a falha de propósito — engolir o erro aqui
 * fazia todo caller mentir sucesso: o setItem estourava (localStorage no teto
 * dos ~5MB, quase sempre por causa do histórico da Lumi em
 * `lumio.lumi.chats.<uid>`, que também ignora quota; ou Safari em navegação
 * privada, que estoura já na 1ª gravação), o addEventAsync retornava o evento
 * como se tivesse gravado, o dialog fechava com toast de sucesso e o
 * reloadCustomEvents relia o localStorage sem o compromisso — sumia sem uma
 * linha de erro na tela. No upload em lote era pior: o caller marcava as
 * linhas como já commitadas e o retry pulava todas.
 */
function write(userId: string, events: CalendarEvent[]): void {
  if (typeof window === "undefined") {
    // Sem window não existe onde persistir; devolver quieto seria o mesmo
    // "sucesso mentiroso" de antes.
    throw new CalendarStorageError(
      "Não foi possível salvar: armazenamento do navegador indisponível.",
    );
  }
  try {
    window.localStorage.setItem(STORAGE_KEY(userId), JSON.stringify(events));
  } catch (err) {
    console.error("[calendar-events] write failed", err);
    throw new CalendarStorageError(
      isQuotaError(err)
        ? "Não foi possível salvar: o armazenamento do navegador está cheio. Apague conversas antigas da Lumi pra liberar espaço e tente de novo."
        : "Não foi possível salvar no armazenamento do navegador. Se estiver em navegação privada, tente numa janela normal.",
      err,
    );
  }
}

export async function listEventsAsync(userId: string): Promise<CalendarEvent[]> {
  const all = read(userId);
  // Ordena cronologicamente
  return all.sort(
    (a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime(),
  );
}

type CalendarEventInput = {
  type: CalendarEventType;
  title: string;
  subject_id?: string;
  starts_at: string;
  ends_at?: string;
  description?: string;
};

function buildEvent(userId: string, data: CalendarEventInput): CalendarEvent {
  return {
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
}

export async function addEventAsync(
  userId: string,
  data: CalendarEventInput,
): Promise<CalendarEvent> {
  const all = read(userId);
  const event = buildEvent(userId, data);
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
 * Adiciona vários eventos de uma vez. Monta todos e grava UMA vez só (tudo ou
 * nada) em vez de chamar addEventAsync N vezes: agora que o write propaga a
 * falha, um estouro de quota no meio do loop deixaria parte das datas na
 * agenda e o retry do caller (academic-calendar-upload, que só marca as linhas
 * como commitadas depois do await) reinseriria essas mesmas linhas
 * duplicadas — addEventAsync não checa duplicata. Retorna os eventos criados.
 */
export async function addEventsBulkAsync(
  userId: string,
  events: Array<CalendarEventInput>,
): Promise<CalendarEvent[]> {
  const all = read(userId);
  const created = events.map((data) => buildEvent(userId, data));
  write(userId, [...all, ...created]);
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
