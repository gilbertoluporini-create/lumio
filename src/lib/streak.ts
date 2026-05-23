import type { Lecture } from "./types";

/**
 * Calcula o streak (dias consecutivos com pelo menos uma aula criada/atualizada).
 *
 * Conta dias distintos desde hoje pra trás, parando no primeiro gap.
 * Considera updatedAt pra que reabrir uma aula antiga também conte.
 */
export function calculateStreak(lectures: Lecture[]): {
  current: number;
  longest: number;
  todayDone: boolean;
} {
  if (lectures.length === 0) {
    return { current: 0, longest: 0, todayDone: false };
  }

  // Set de dias (yyyy-mm-dd) com atividade
  const days = new Set<string>();
  for (const l of lectures) {
    const dates = [l.createdAt, l.updatedAt].filter(Boolean) as string[];
    for (const d of dates) {
      const day = dayKey(new Date(d));
      days.add(day);
    }
  }

  const today = dayKey(new Date());
  const todayDone = days.has(today);

  // Current streak: começa de hoje (ou ontem se hoje vazio), conta pra trás
  let current = 0;
  const start = todayDone ? new Date() : addDays(new Date(), -1);
  for (let i = 0; i < 366; i++) {
    const d = addDays(start, -i);
    if (days.has(dayKey(d))) {
      current++;
    } else {
      break;
    }
  }

  // Longest: encontra a maior sequência no set
  const sortedDays = Array.from(days).sort();
  let longest = 0;
  let run = 0;
  let prevKey: string | null = null;
  for (const k of sortedDays) {
    if (prevKey === null) {
      run = 1;
    } else {
      const dPrev = dateFromKey(prevKey);
      const dCurr = dateFromKey(k);
      const diff = Math.round(
        (dCurr.getTime() - dPrev.getTime()) / (24 * 60 * 60 * 1000),
      );
      if (diff === 1) {
        run += 1;
      } else {
        run = 1;
      }
    }
    if (run > longest) longest = run;
    prevKey = k;
  }

  return { current, longest, todayDone };
}

function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function dateFromKey(k: string): Date {
  const [y, m, d] = k.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}
