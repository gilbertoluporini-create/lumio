"use client";

/**
 * Quiz Attempts — persistência client-side de respostas de quizzes.
 *
 * Atualmente usa localStorage com chave `lumio.quiz.attempts.${userId}`.
 * Quando criarmos a tabela `quiz_attempts` no Supabase, plugamos aqui sem
 * mexer nos componentes (todas as funções list/save são async).
 *
 * Stats derivados em `getStats`:
 *  - total / correct / accuracy
 *  - streak: dias consecutivos com pelo menos um attempt (terminando hoje
 *    ou ontem). bestStreak: maior sequência histórica.
 *  - totalTimeMs: somatório de time_ms de todos attempts.
 *  - weekly: 7 dias terminando hoje (S T Q Q S S D) com contagem de attempts.
 */

export type QuizAttempt = {
  id: string;
  user_id: string;
  asset_id: string;
  question_index: number;
  selected_index: number;
  correct: boolean;
  answered_at: string; // ISO
  time_ms: number;
};

export type QuizStats = {
  total: number;
  correct: number;
  accuracy: number; // 0..100
  streak: number;
  bestStreak: number;
  totalTimeMs: number;
  weekly: { day: string; count: number }[];
  /** Série de 8 semanas (mais antiga -> mais recente) com contagem de attempts. */
  weeklySeries: number[];
  answeredThisWeek: number;
  answeredLastWeek: number;
};

const STORAGE_PREFIX = "lumio.quiz.attempts.";

function storageKey(userId: string): string {
  return `${STORAGE_PREFIX}${userId}`;
}

function isQuizAttempt(x: unknown): x is QuizAttempt {
  if (typeof x !== "object" || x === null) return false;
  const a = x as Record<string, unknown>;
  return (
    typeof a.id === "string" &&
    typeof a.user_id === "string" &&
    typeof a.asset_id === "string" &&
    typeof a.question_index === "number" &&
    typeof a.selected_index === "number" &&
    typeof a.correct === "boolean" &&
    typeof a.answered_at === "string" &&
    typeof a.time_ms === "number"
  );
}

function readLocal(userId: string): QuizAttempt[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isQuizAttempt);
  } catch {
    return [];
  }
}

function writeLocal(userId: string, attempts: QuizAttempt[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(attempts));
    window.dispatchEvent(
      new CustomEvent("lumio:quiz-attempts-changed", { detail: { userId } }),
    );
  } catch {
    /* quota or serialization error — silently ignore */
  }
}

export async function listAttemptsAsync(
  userId: string,
): Promise<QuizAttempt[]> {
  // Hoje: localStorage. Amanhã: Supabase `quiz_attempts` por user_id.
  return readLocal(userId);
}

export async function saveAttemptAsync(attempt: QuizAttempt): Promise<void> {
  const current = readLocal(attempt.user_id);
  // Dedup defensivo por id
  const filtered = current.filter((a) => a.id !== attempt.id);
  filtered.push(attempt);
  writeLocal(attempt.user_id, filtered);
}

export function subscribeAttempts(
  userId: string,
  callback: (attempts: QuizAttempt[]) => void,
): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = () => callback(readLocal(userId));
  window.addEventListener("lumio:quiz-attempts-changed", handler);
  window.addEventListener("storage", handler);
  callback(readLocal(userId));
  return () => {
    window.removeEventListener("lumio:quiz-attempts-changed", handler);
    window.removeEventListener("storage", handler);
  };
}

// ============================================================================
// Stats
// ============================================================================

function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function startOfWeekMonday(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  const dow = (r.getDay() + 6) % 7; // 0 = segunda
  r.setDate(r.getDate() - dow);
  return r;
}

const WEEKDAY_SHORT = ["S", "T", "Q", "Q", "S", "S", "D"];

export function getStats(attempts: QuizAttempt[]): QuizStats {
  const total = attempts.length;
  const correct = attempts.filter((a) => a.correct).length;
  const accuracy = total === 0 ? 0 : Math.round((correct / total) * 100);
  const totalTimeMs = attempts.reduce((sum, a) => sum + (a.time_ms || 0), 0);

  // Set de dias com atividade
  const daysWithActivity = new Set<string>();
  for (const a of attempts) {
    const d = new Date(a.answered_at);
    if (!Number.isNaN(d.getTime())) {
      daysWithActivity.add(dayKey(d));
    }
  }

  // Streak atual: começa hoje (ou ontem se hoje vazio), vai pra trás
  const today = new Date();
  let streak = 0;
  const todayDone = daysWithActivity.has(dayKey(today));
  const start = todayDone ? today : addDays(today, -1);
  for (let i = 0; i < 366; i++) {
    const d = addDays(start, -i);
    if (daysWithActivity.has(dayKey(d))) {
      streak++;
    } else {
      break;
    }
  }

  // Best streak: maior sequência em todos os tempos
  let bestStreak = 0;
  const sortedDays = Array.from(daysWithActivity).sort();
  let run = 0;
  let prevKey: string | null = null;
  for (const k of sortedDays) {
    if (prevKey === null) {
      run = 1;
    } else {
      const [py, pm, pd] = prevKey.split("-").map(Number);
      const [cy, cm, cd] = k.split("-").map(Number);
      const dPrev = new Date(py, pm - 1, pd);
      const dCurr = new Date(cy, cm - 1, cd);
      const diff = Math.round(
        (dCurr.getTime() - dPrev.getTime()) / (24 * 60 * 60 * 1000),
      );
      run = diff === 1 ? run + 1 : 1;
    }
    if (run > bestStreak) bestStreak = run;
    prevKey = k;
  }
  // Se streak atual > bestStreak (edge case), normaliza
  if (streak > bestStreak) bestStreak = streak;

  // Weekly: 7 dias terminando hoje
  const dayCounts = new Map<string, number>();
  for (const a of attempts) {
    const d = new Date(a.answered_at);
    if (Number.isNaN(d.getTime())) continue;
    const k = dayKey(d);
    dayCounts.set(k, (dayCounts.get(k) ?? 0) + 1);
  }
  const weekly: { day: string; count: number }[] = [];
  // Inicia em segunda da semana atual
  const monday = startOfWeekMonday(today);
  for (let i = 0; i < 7; i++) {
    const d = addDays(monday, i);
    weekly.push({
      day: WEEKDAY_SHORT[i],
      count: dayCounts.get(dayKey(d)) ?? 0,
    });
  }

  // Série de 8 semanas (mais antiga -> mais recente)
  const weeklySeries: number[] = [];
  for (let w = 7; w >= 0; w--) {
    const weekStart = addDays(monday, -7 * w);
    let count = 0;
    for (let i = 0; i < 7; i++) {
      const d = addDays(weekStart, i);
      count += dayCounts.get(dayKey(d)) ?? 0;
    }
    weeklySeries.push(count);
  }
  const answeredThisWeek = weeklySeries[weeklySeries.length - 1] ?? 0;
  const answeredLastWeek = weeklySeries[weeklySeries.length - 2] ?? 0;

  return {
    total,
    correct,
    accuracy,
    streak,
    bestStreak,
    totalTimeMs,
    weekly,
    weeklySeries,
    answeredThisWeek,
    answeredLastWeek,
  };
}

// ============================================================================
// Helpers de formatação (UI)
// ============================================================================

export function formatPracticeTime(ms: number): string {
  if (ms <= 0) return "0min";
  const totalMin = Math.floor(ms / 60000);
  if (totalMin < 60) return `${totalMin}min`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}min`;
}

/**
 * Stats por banco de questões (asset_id), pra mostrar no card de cada quiz.
 */
export function getAccuracyByAsset(
  attempts: QuizAttempt[],
): Map<string, { total: number; correct: number; accuracy: number; lastAt: string | null }> {
  const map = new Map<
    string,
    { total: number; correct: number; accuracy: number; lastAt: string | null }
  >();
  for (const a of attempts) {
    const cur = map.get(a.asset_id) ?? { total: 0, correct: 0, accuracy: 0, lastAt: null };
    cur.total += 1;
    if (a.correct) cur.correct += 1;
    if (!cur.lastAt || a.answered_at > cur.lastAt) cur.lastAt = a.answered_at;
    map.set(a.asset_id, cur);
  }
  for (const v of map.values()) {
    v.accuracy = v.total === 0 ? 0 : Math.round((v.correct / v.total) * 100);
  }
  return map;
}
