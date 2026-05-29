/**
 * Cálculo de horários livres por dia da semana, a partir das aulas
 * agendadas das matérias do user (Subject.schedule).
 *
 * Usado pelo gerador de rotina de estudo — não dá pra propor blocos de
 * estudo em cima de horário de aula, então invertemos o schedule.
 */

import type { Subject, ScheduleSlot } from "@/lib/types";
import { DAY_LABELS_LONG } from "@/lib/types";

/** Janela "estudável" padrão por dia (cobre manhã + tarde + noite). */
const DAY_START_MIN = 7 * 60; // 07:00
const DAY_END_MIN = 23 * 60; // 23:00

/** Blocos muito curtos (<30min) não viram bloco de estudo útil. */
const MIN_BLOCK_MIN = 30;

export type FreeBlock = {
  startTime: string; // "HH:MM"
  endTime: string; // "HH:MM"
  minutes: number;
};

export type FreeDay = {
  dayOfWeek: number;
  dayLabel: string;
  freeBlocks: FreeBlock[];
  totalFreeMinutes: number;
};

function toMinutes(hhmm: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return -1;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return -1;
  return Math.max(0, Math.min(24 * 60, h * 60 + min));
}

function toHHMM(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Coleta TODAS as aulas (de todas as matérias) num único calendário
 * indexado por dia da semana, em minutos do dia.
 */
function collectBusyByDay(subjects: Subject[]): Map<number, Array<[number, number]>> {
  const busy = new Map<number, Array<[number, number]>>();
  for (const s of subjects) {
    const slots: ScheduleSlot[] = Array.isArray(s.schedule) ? s.schedule : [];
    for (const slot of slots) {
      const day = slot.dayOfWeek;
      if (!Number.isInteger(day) || day < 0 || day > 6) continue;
      const start = toMinutes(slot.startTime);
      const end = toMinutes(slot.endTime);
      if (start < 0 || end <= start) continue;
      const list = busy.get(day) ?? [];
      list.push([start, end]);
      busy.set(day, list);
    }
  }
  return busy;
}

/** Une intervalos sobrepostos/encostados de um mesmo dia. */
function mergeIntervals(
  intervals: Array<[number, number]>,
): Array<[number, number]> {
  if (intervals.length === 0) return [];
  const sorted = [...intervals].sort((a, b) => a[0] - b[0]);
  const out: Array<[number, number]> = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const cur = sorted[i];
    const last = out[out.length - 1];
    if (cur[0] <= last[1]) {
      last[1] = Math.max(last[1], cur[1]);
    } else {
      out.push(cur);
    }
  }
  return out;
}

/**
 * Devolve, pra cada dia da semana (0=dom..6=sáb), os blocos livres entre
 * 07:00 e 23:00, ignorando lacunas menores que MIN_BLOCK_MIN.
 */
export function computeFreeWeek(subjects: Subject[]): FreeDay[] {
  const busy = collectBusyByDay(subjects);
  const out: FreeDay[] = [];
  for (let day = 0; day < 7; day++) {
    const merged = mergeIntervals(busy.get(day) ?? []);
    const free: FreeBlock[] = [];
    let cursor = DAY_START_MIN;
    for (const [s, e] of merged) {
      if (s > cursor) {
        const gap = s - cursor;
        if (gap >= MIN_BLOCK_MIN) {
          free.push({
            startTime: toHHMM(cursor),
            endTime: toHHMM(s),
            minutes: gap,
          });
        }
      }
      cursor = Math.max(cursor, e);
    }
    if (DAY_END_MIN > cursor) {
      const gap = DAY_END_MIN - cursor;
      if (gap >= MIN_BLOCK_MIN) {
        free.push({
          startTime: toHHMM(cursor),
          endTime: toHHMM(DAY_END_MIN),
          minutes: gap,
        });
      }
    }
    out.push({
      dayOfWeek: day,
      dayLabel: DAY_LABELS_LONG[day],
      freeBlocks: free,
      totalFreeMinutes: free.reduce((acc, b) => acc + b.minutes, 0),
    });
  }
  return out;
}

/** Formato compacto pra alimentar prompt da LLM. */
export function freeWeekToPromptLines(week: FreeDay[]): string {
  return week
    .map((d) => {
      if (d.freeBlocks.length === 0) {
        return `${d.dayLabel}: sem horário livre relevante.`;
      }
      const parts = d.freeBlocks
        .map((b) => `${b.startTime}-${b.endTime} (${b.minutes}min)`)
        .join(", ");
      return `${d.dayLabel}: ${parts}`;
    })
    .join("\n");
}
