"use client";

/**
 * Hook contextual do /lumi — agrega os sinais que importam pra decidir quais
 * quick-actions/chips fazem sentido AGORA pro user.
 *
 * Filosofia: RESILIENTE. Cada fonte (Supabase / localStorage) é isolada num
 * try/catch — se falhar, o campo vira null e a UI esconde o chip. Nunca
 * propaga erro pra cima.
 *
 * Tudo client-side (Supabase JS + localStorage). Sem API route.
 */

import { useCallback, useEffect, useState } from "react";
import { listLecturesAsync, listSubjectsAsync } from "@/lib/db";
import { listEventsAsync, type CalendarEvent } from "@/lib/calendar-events";
import { calculateStreak } from "@/lib/streak";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import type { Lecture, Subject } from "@/lib/types";

export type StudyContextLastLecture = {
  id: string;
  title: string;
  createdAt: string;
  hoursAgo: number;
  subjectId: string | null;
  subjectName: string | null;
};

export type StudyContextActivePlan = {
  id: string;
  title: string;
  nextItemId: string | null;
  nextItemTitle: string | null;
  nextItemKind: string | null;
  completedRatio: number; // 0..1
};

export type StudyContextNextExam = {
  eventId: string;
  title: string;
  startsAt: string;
  daysUntil: number;
  subjectId: string | null;
  subjectName: string | null;
};

export type StudyContextActiveSubject = {
  id: string;
  name: string;
};

export type StudyContext = {
  lastLecture: StudyContextLastLecture | null;
  activePlan: StudyContextActivePlan | null;
  nextExam: StudyContextNextExam | null;
  activeSubject: StudyContextActiveSubject | null;
  streak: number;
};

const EMPTY_CONTEXT: StudyContext = {
  lastLecture: null,
  activePlan: null,
  nextExam: null,
  activeSubject: null,
  streak: 0,
};

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/* ---------------- internal fetchers (cada um isolado em try/catch) ---------------- */

async function fetchLecturesSafe(userId: string): Promise<Lecture[]> {
  try {
    return await listLecturesAsync(userId);
  } catch (err) {
    console.warn("[use-study-context] lectures failed", err);
    return [];
  }
}

async function fetchSubjectsSafe(userId: string): Promise<Subject[]> {
  try {
    return await listSubjectsAsync(userId);
  } catch (err) {
    console.warn("[use-study-context] subjects failed", err);
    return [];
  }
}

async function fetchEventsSafe(userId: string): Promise<CalendarEvent[]> {
  try {
    return await listEventsAsync(userId);
  } catch (err) {
    console.warn("[use-study-context] events failed", err);
    return [];
  }
}

type ActivePlanRow = {
  id: string;
  title: string;
};

type NextItemRow = {
  id: string;
  title: string;
  kind: string;
  status: string;
};

async function fetchActivePlanSafe(
  userId: string,
): Promise<StudyContextActivePlan | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const supabase = createClient();
    const { data: planData, error: planErr } = await supabase
      .from("study_plans")
      .select("id, title")
      .eq("user_id", userId)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (planErr || !planData) return null;
    const plan = planData as ActivePlanRow;

    // Pega items pra calcular ratio + descobrir próximo pendente (menor position).
    const { data: itemsData, error: itemsErr } = await supabase
      .from("study_plan_items")
      .select("id, title, kind, status, position")
      .eq("plan_id", plan.id)
      .order("position", { ascending: true });

    if (itemsErr || !itemsData) {
      return {
        id: plan.id,
        title: plan.title,
        nextItemId: null,
        nextItemTitle: null,
        nextItemKind: null,
        completedRatio: 0,
      };
    }

    const items = itemsData as Array<NextItemRow & { position: number }>;
    const total = items.length;
    const done = items.filter((i) => i.status === "done").length;
    const next = items.find(
      (i) => i.status !== "done" && i.status !== "failed",
    );

    return {
      id: plan.id,
      title: plan.title,
      nextItemId: next?.id ?? null,
      nextItemTitle: next?.title ?? null,
      nextItemKind: next?.kind ?? null,
      completedRatio: total > 0 ? done / total : 0,
    };
  } catch (err) {
    console.warn("[use-study-context] active plan failed", err);
    return null;
  }
}

/* ---------------- derivations ---------------- */

function deriveLastLecture(
  lectures: Lecture[],
  subjects: Subject[],
): StudyContextLastLecture | null {
  if (lectures.length === 0) return null;
  // listLecturesAsync já vem ordenado desc, mas garantimos.
  const sorted = [...lectures].sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  const top = sorted[0];
  if (!top) return null;
  const ageMs = Date.now() - new Date(top.createdAt).getTime();
  if (ageMs > DAY_MS) return null;
  const subject = subjects.find((s) => s.id === top.subjectId) ?? null;
  return {
    id: top.id,
    title: top.title,
    createdAt: top.createdAt,
    hoursAgo: Math.max(0, Math.round(ageMs / HOUR_MS)),
    subjectId: top.subjectId ?? null,
    subjectName: subject?.name ?? null,
  };
}

function deriveNextExam(
  events: CalendarEvent[],
  subjects: Subject[],
): StudyContextNextExam | null {
  const now = Date.now();
  const upcoming = events
    .filter((e) => e.type === "prova")
    .filter((e) => new Date(e.starts_at).getTime() > now)
    .sort(
      (a, b) =>
        new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime(),
    );
  const next = upcoming[0];
  if (!next) return null;
  const daysUntil = Math.max(
    0,
    Math.ceil((new Date(next.starts_at).getTime() - now) / DAY_MS),
  );
  const subject = next.subject_id
    ? subjects.find((s) => s.id === next.subject_id) ?? null
    : null;
  return {
    eventId: next.id,
    title: next.title,
    startsAt: next.starts_at,
    daysUntil,
    subjectId: next.subject_id ?? null,
    subjectName: subject?.name ?? null,
  };
}

function deriveActiveSubject(
  lectures: Lecture[],
  subjects: Subject[],
): StudyContextActiveSubject | null {
  if (subjects.length === 0 || lectures.length === 0) return null;
  const cutoff = Date.now() - 7 * DAY_MS;
  const counts = new Map<string, number>();
  for (const l of lectures) {
    const created = new Date(l.createdAt).getTime();
    const updated = new Date(l.updatedAt).getTime();
    if (Math.max(created, updated) < cutoff) continue;
    if (!l.subjectId) continue;
    counts.set(l.subjectId, (counts.get(l.subjectId) ?? 0) + 1);
  }
  if (counts.size === 0) return null;
  let topId: string | null = null;
  let topCount = 0;
  for (const [id, c] of counts.entries()) {
    if (c > topCount) {
      topCount = c;
      topId = id;
    }
  }
  if (!topId) return null;
  const subject = subjects.find((s) => s.id === topId);
  if (!subject) return null;
  return { id: subject.id, name: subject.name };
}

/* ---------------- hook ---------------- */

export type UseStudyContextResult = {
  context: StudyContext | null;
  loading: boolean;
  refresh: () => Promise<void>;
};

export function useStudyContext(
  userId: string | null | undefined,
): UseStudyContextResult {
  const [context, setContext] = useState<StudyContext | null>(null);
  const [loading, setLoading] = useState<boolean>(Boolean(userId));

  const load = useCallback(async (): Promise<void> => {
    if (!userId) {
      setContext(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      // Roda tudo em paralelo — cada fetcher já é safe.
      const [lectures, subjects, events, activePlan] = await Promise.all([
        fetchLecturesSafe(userId),
        fetchSubjectsSafe(userId),
        fetchEventsSafe(userId),
        fetchActivePlanSafe(userId),
      ]);

      const streakInfo = (() => {
        try {
          return calculateStreak(lectures).current;
        } catch {
          return 0;
        }
      })();

      const next: StudyContext = {
        lastLecture: deriveLastLecture(lectures, subjects),
        activePlan,
        nextExam: deriveNextExam(events, subjects),
        activeSubject: deriveActiveSubject(lectures, subjects),
        streak: streakInfo,
      };
      setContext(next);
    } catch (err) {
      // Defesa final — não deve cair aqui porque cada fetcher é safe.
      console.warn("[use-study-context] load failed", err);
      setContext(EMPTY_CONTEXT);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  return { context, loading, refresh: load };
}
