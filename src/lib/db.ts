"use client";

import { isSupabaseConfigured, createClient } from "./supabase/client";
import { Analytics } from "./analytics";
import {
  bulkCreateSubjects as localBulkSubjects,
  createSubject as localCreateSubject,
  deleteSubject as localDeleteSubject,
  listSubjects as localListSubjects,
  createLecture as localCreateLecture,
  deleteLecture as localDeleteLecture,
  getLecture as localGetLecture,
  listLectures as localListLectures,
  updateLecture as localUpdateLecture,
  appendMessage as localAppendMessage,
  getSubject as localGetSubject,
} from "./storage";
import { generateId } from "./utils";
import type {
  ChatMessage,
  Lecture,
  ScheduleSlot,
  Slide,
  Subject,
  TranscriptEntry,
  TranscriptInsights,
} from "./types";

/**
 * Adapter unificado de persistência. Usa Supabase quando configurado,
 * senão cai pra localStorage. API é toda async pra suportar ambos.
 */

// ===== SUBJECTS =====

type SubjectRow = {
  id: string;
  user_id: string;
  name: string;
  color: string;
  icon: string | null;
  schedule: ScheduleSlot[] | null;
  created_at: string;
};

function rowToSubject(r: SubjectRow): Subject {
  return {
    id: r.id,
    userId: r.user_id,
    name: r.name,
    color: r.color,
    icon: r.icon ?? undefined,
    emoji: "",
    schedule: Array.isArray(r.schedule) ? r.schedule : [],
    createdAt: r.created_at,
  };
}

const SUBJECT_COLS = "id, user_id, name, color, icon, schedule, created_at";

export async function listSubjectsAsync(userId: string): Promise<Subject[]> {
  if (!isSupabaseConfigured()) return localListSubjects(userId);
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("subjects")
      .select(SUBJECT_COLS)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return (data as SubjectRow[]).map(rowToSubject);
  } catch (err) {
    console.error("[db] listSubjects fallback", err);
    return localListSubjects(userId);
  }
}

export async function createSubjectAsync(
  userId: string,
  data: {
    name: string;
    color: string;
    icon?: string;
    emoji?: string;
    schedule?: ScheduleSlot[];
  },
): Promise<Subject> {
  if (!isSupabaseConfigured()) {
    return localCreateSubject(userId, {
      name: data.name,
      color: data.color,
      icon: data.icon,
      emoji: data.emoji ?? "",
      schedule: data.schedule ?? [],
    });
  }
  const supabase = createClient();
  const { data: row, error } = await supabase
    .from("subjects")
    .insert({
      user_id: userId,
      name: data.name,
      color: data.color,
      icon: data.icon ?? null,
      schedule: data.schedule ?? [],
    })
    .select(SUBJECT_COLS)
    .single();
  if (error || !row) throw error || new Error("Falha ao criar matéria.");
  return rowToSubject(row as SubjectRow);
}

export async function updateSubjectIconAsync(
  userId: string,
  subjectId: string,
  icon: string | null,
): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const supabase = createClient();
  const { error } = await supabase
    .from("subjects")
    .update({ icon })
    .eq("id", subjectId);
  if (error) throw error;
}

export async function bulkCreateSubjectsAsync(
  userId: string,
  items: Array<{
    name: string;
    color: string;
    emoji?: string;
    schedule?: ScheduleSlot[];
  }>,
): Promise<Subject[]> {
  if (!isSupabaseConfigured()) {
    return localBulkSubjects(
      userId,
      items.map((s) => ({
        name: s.name,
        color: s.color,
        emoji: s.emoji ?? "",
        schedule: s.schedule ?? [],
      })),
    );
  }
  const supabase = createClient();
  // Idempotente: pula matérias cujo nome já existe (RLS escopa ao user, igual
  // listSubjectsAsync). Sem isso, rodar o onboarding 2x duplicava TODAS as
  // matérias (incidente de 2026-05-27).
  const { data: existing } = await supabase.from("subjects").select("name");
  const taken = new Set(
    ((existing ?? []) as { name: string }[]).map((r) =>
      r.name.trim().toLowerCase(),
    ),
  );
  const fresh = items.filter((i) => !taken.has(i.name.trim().toLowerCase()));
  if (fresh.length === 0) return [];
  const { data, error } = await supabase
    .from("subjects")
    .insert(
      fresh.map((i) => ({
        user_id: userId,
        name: i.name,
        color: i.color,
        schedule: i.schedule ?? [],
      })),
    )
    .select(SUBJECT_COLS);
  if (error || !data) throw error || new Error("Falha ao criar matérias.");
  return (data as SubjectRow[]).map(rowToSubject);
}

export async function updateSubjectScheduleAsync(
  userId: string,
  subjectId: string,
  schedule: ScheduleSlot[],
): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const supabase = createClient();
  const { error } = await supabase
    .from("subjects")
    .update({ schedule })
    .eq("id", subjectId);
  if (error) throw error;
}

export async function updateSubjectColorAsync(
  userId: string,
  subjectId: string,
  color: string,
): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const supabase = createClient();
  const { error } = await supabase
    .from("subjects")
    .update({ color })
    .eq("id", subjectId);
  if (error) throw error;
}

export async function deleteSubjectAsync(userId: string, id: string): Promise<void> {
  if (!isSupabaseConfigured()) {
    localDeleteSubject(userId, id);
    return;
  }
  const supabase = createClient();
  const { error } = await supabase.from("subjects").delete().eq("id", id);
  if (error) throw error;
}

export async function getSubjectAsync(
  userId: string,
  id: string,
): Promise<Subject | null> {
  if (!isSupabaseConfigured()) return localGetSubject(userId, id);
  try {
    const supabase = createClient();
    const { data } = await supabase
      .from("subjects")
      .select(SUBJECT_COLS)
      .eq("id", id)
      .maybeSingle();
    if (!data) return null;
    return rowToSubject(data as SubjectRow);
  } catch (err) {
    console.error("[db] getSubject fallback", err);
    return localGetSubject(userId, id);
  }
}

// ===== LECTURES =====

type LectureRow = {
  id: string;
  user_id: string;
  subject_id: string | null;
  title: string;
  transcript: string;
  transcript_entries: TranscriptEntry[] | null;
  transcript_insights: TranscriptInsights | null;
  transcript_chapters: import("@/lib/types").TranscriptChapters | null;
  duration_sec: number;
  status: "draft" | "live" | "completed";
  slides_file_name: string | null;
  slides: Slide[] | null;
  messages: ChatMessage[];
  audio_url: string | null;
  created_at: string;
  updated_at: string;
};

function rowToLecture(r: LectureRow): Lecture {
  const slidesArr = Array.isArray(r.slides) && r.slides.length > 0 ? r.slides : undefined;
  return {
    id: r.id,
    userId: r.user_id,
    subjectId: r.subject_id ?? "",
    title: r.title,
    transcript: r.transcript,
    transcriptEntries: r.transcript_entries ?? undefined,
    transcriptInsights: r.transcript_insights ?? undefined,
    transcriptChapters: r.transcript_chapters ?? undefined,
    durationSec: r.duration_sec,
    status: r.status,
    slidesFileName: r.slides_file_name ?? undefined,
    slides: slidesArr,
    messages: r.messages ?? [],
    audioUrl: r.audio_url ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

const LECTURE_COLS =
  "id, user_id, subject_id, title, transcript, transcript_entries, transcript_insights, transcript_chapters, duration_sec, status, slides_file_name, slides, messages, audio_url, created_at, updated_at";

export async function listLecturesAsync(
  userId: string,
  subjectId?: string,
): Promise<Lecture[]> {
  if (!isSupabaseConfigured()) return localListLectures(userId, subjectId);
  try {
    const supabase = createClient();
    let q = supabase
      .from("lectures")
      .select(LECTURE_COLS)
      .order("created_at", { ascending: false });
    if (subjectId) q = q.eq("subject_id", subjectId);
    const { data, error } = await q;
    if (error) throw error;
    return (data as LectureRow[]).map(rowToLecture);
  } catch (err) {
    console.error("[db] listLectures fallback", err);
    return localListLectures(userId, subjectId);
  }
}

export async function getLectureAsync(
  userId: string,
  id: string,
): Promise<Lecture | null> {
  if (!isSupabaseConfigured()) return localGetLecture(userId, id);
  try {
    const supabase = createClient();
    const { data } = await supabase
      .from("lectures")
      .select(LECTURE_COLS)
      .eq("id", id)
      .maybeSingle();
    return data ? rowToLecture(data as LectureRow) : null;
  } catch (err) {
    console.error("[db] getLecture fallback", err);
    return localGetLecture(userId, id);
  }
}

/** Dispara firstLectureRecorded() só na 1ª aula daquele user nesse browser. */
function fireFirstLectureOnce(userId: string): void {
  if (typeof window === "undefined") return;
  const key = `lumio.first_lecture_fired:${userId}`;
  try {
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, "1");
    Analytics.firstLectureRecorded();
  } catch {
    /* localStorage indisponível */
  }
}

export async function createLectureAsync(
  userId: string,
  data: { subjectId: string; title: string },
): Promise<Lecture> {
  if (!isSupabaseConfigured()) {
    const lec = localCreateLecture(userId, {
      subjectId: data.subjectId,
      title: data.title,
    });
    fireFirstLectureOnce(userId);
    return lec;
  }
  // Usa endpoint server-side que aplica gate de limite mensal de aulas + cria
  const res = await fetch("/api/lectures/create", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      subjectId: data.subjectId,
      title: data.title,
    }),
  });
  const json = await res.json();
  if (!res.ok) {
    const err = new Error(json?.error ?? "Falha ao criar aula.");
    // Anexa info pra UI mostrar prompt de upgrade quando 402
    if (res.status === 402) {
      (err as Error & { upgrade?: string; usage?: unknown }).upgrade =
        json?.upgrade;
      (err as Error & { upgrade?: string; usage?: unknown }).usage = {
        used: json?.used,
        limit: json?.limit,
        plan: json?.plan,
      };
      Analytics.paywallView("plan_limit", "create_lecture");
    }
    throw err;
  }
  fireFirstLectureOnce(userId);
  return rowToLecture(json.lecture as LectureRow);
}

export async function updateLectureAsync(
  userId: string,
  id: string,
  patch: Partial<Lecture>,
): Promise<Lecture | null> {
  if (!isSupabaseConfigured()) return localUpdateLecture(userId, id, patch);
  const supabase = createClient();
  // Translate camelCase → snake_case.
  // IMPORTANTE: usamos `in patch` (não `!== undefined`) pra permitir "limpar"
  // um campo passando undefined ou null — converte pra null no Supabase.
  const dbPatch: Record<string, unknown> = {};
  if ("title" in patch) dbPatch.title = patch.title ?? null;
  if ("transcript" in patch) dbPatch.transcript = patch.transcript ?? null;
  if ("transcriptEntries" in patch)
    dbPatch.transcript_entries = patch.transcriptEntries ?? null;
  if ("transcriptInsights" in patch)
    dbPatch.transcript_insights = patch.transcriptInsights ?? null;
  if ("transcriptChapters" in patch)
    dbPatch.transcript_chapters = patch.transcriptChapters ?? null;
  if ("durationSec" in patch) dbPatch.duration_sec = patch.durationSec ?? null;
  if ("status" in patch) dbPatch.status = patch.status ?? null;
  if ("slidesFileName" in patch)
    dbPatch.slides_file_name = patch.slidesFileName ?? null;
  if ("slides" in patch) dbPatch.slides = patch.slides ?? null;
  if ("messages" in patch) dbPatch.messages = patch.messages ?? null;
  if ("audioUrl" in patch) dbPatch.audio_url = patch.audioUrl ?? null;
  if (Object.keys(dbPatch).length === 0) return getLectureAsync(userId, id);

  const { data, error } = await supabase
    .from("lectures")
    .update(dbPatch)
    .eq("id", id)
    .select(LECTURE_COLS)
    .single();
  if (error) throw error;
  return data ? rowToLecture(data as LectureRow) : null;
}

export async function appendMessageAsync(
  userId: string,
  lectureId: string,
  message: ChatMessage,
): Promise<Lecture | null> {
  if (!isSupabaseConfigured()) {
    return localAppendMessage(userId, lectureId, message);
  }
  // Pega current messages e adiciona
  const current = await getLectureAsync(userId, lectureId);
  if (!current) return null;
  const next = [...current.messages, message];
  return updateLectureAsync(userId, lectureId, { messages: next });
}

export async function deleteLectureAsync(
  userId: string,
  id: string,
): Promise<void> {
  if (!isSupabaseConfigured()) {
    localDeleteLecture(userId, id);
    return;
  }
  const supabase = createClient();
  const { error } = await supabase.from("lectures").delete().eq("id", id);
  if (error) throw error;
}

// ===== Subscription (read-only no client) =====

export type ClientSubscription = {
  plan: "free" | "pro" | "annual";
  status: "inactive" | "active" | "past_due" | "canceled" | "incomplete" | "trialing";
  current_period_end: string | null;
  cancel_at_period_end: boolean;
};

export async function getMySubscriptionAsync(): Promise<ClientSubscription | null> {
  if (!isSupabaseConfigured()) {
    return { plan: "free", status: "inactive", current_period_end: null, cancel_at_period_end: false };
  }
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;
    const { data } = await supabase
      .from("subscriptions")
      .select("plan, status, current_period_end, cancel_at_period_end")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!data) return { plan: "free", status: "inactive", current_period_end: null, cancel_at_period_end: false };
    return data as ClientSubscription;
  } catch (err) {
    console.error("[db] getMySubscription failed", err);
    return null;
  }
}

export function isActiveSubscription(sub: ClientSubscription | null): boolean {
  if (!sub) return false;
  return sub.status === "active" || sub.status === "trialing";
}

export function isPaidPlan(sub: ClientSubscription | null): boolean {
  return isActiveSubscription(sub) && sub!.plan !== "free";
}
