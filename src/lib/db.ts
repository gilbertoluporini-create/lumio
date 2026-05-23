"use client";

import { isSupabaseConfigured, createClient } from "./supabase/client";
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
import type { ChatMessage, Lecture, Slide, Subject } from "./types";

/**
 * Adapter unificado de persistência. Usa Supabase quando configurado,
 * senão cai pra localStorage. API é toda async pra suportar ambos.
 */

// ===== SUBJECTS =====

export async function listSubjectsAsync(userId: string): Promise<Subject[]> {
  if (!isSupabaseConfigured()) return localListSubjects(userId);
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("subjects")
      .select("id, user_id, name, color, created_at")
      .order("created_at", { ascending: true });
    if (error) throw error;
    return (data as Array<{
      id: string;
      user_id: string;
      name: string;
      color: string;
      created_at: string;
    }>).map((r) => ({
      id: r.id,
      userId: r.user_id,
      name: r.name,
      color: r.color,
      emoji: "",
      createdAt: r.created_at,
    }));
  } catch (err) {
    console.error("[db] listSubjects fallback", err);
    return localListSubjects(userId);
  }
}

export async function createSubjectAsync(
  userId: string,
  data: { name: string; color: string; emoji?: string },
): Promise<Subject> {
  if (!isSupabaseConfigured()) {
    return localCreateSubject(userId, {
      name: data.name,
      color: data.color,
      emoji: data.emoji ?? "",
    });
  }
  const supabase = createClient();
  const { data: row, error } = await supabase
    .from("subjects")
    .insert({ user_id: userId, name: data.name, color: data.color })
    .select("id, user_id, name, color, created_at")
    .single();
  if (error || !row) throw error || new Error("Falha ao criar matéria.");
  const r = row as {
    id: string;
    user_id: string;
    name: string;
    color: string;
    created_at: string;
  };
  return {
    id: r.id,
    userId: r.user_id,
    name: r.name,
    color: r.color,
    emoji: "",
    createdAt: r.created_at,
  };
}

export async function bulkCreateSubjectsAsync(
  userId: string,
  items: Array<{ name: string; color: string; emoji?: string }>,
): Promise<Subject[]> {
  if (!isSupabaseConfigured()) {
    return localBulkSubjects(
      userId,
      items.map((s) => ({ name: s.name, color: s.color, emoji: s.emoji ?? "" })),
    );
  }
  const supabase = createClient();
  const { data, error } = await supabase
    .from("subjects")
    .insert(items.map((i) => ({ user_id: userId, name: i.name, color: i.color })))
    .select("id, user_id, name, color, created_at");
  if (error || !data) throw error || new Error("Falha ao criar matérias.");
  return (data as Array<{
    id: string;
    user_id: string;
    name: string;
    color: string;
    created_at: string;
  }>).map((r) => ({
    id: r.id,
    userId: r.user_id,
    name: r.name,
    color: r.color,
    emoji: "",
    createdAt: r.created_at,
  }));
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
      .select("id, user_id, name, color, created_at")
      .eq("id", id)
      .maybeSingle();
    if (!data) return null;
    const r = data as {
      id: string;
      user_id: string;
      name: string;
      color: string;
      created_at: string;
    };
    return {
      id: r.id,
      userId: r.user_id,
      name: r.name,
      color: r.color,
      emoji: "",
      createdAt: r.created_at,
    };
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
  duration_sec: number;
  status: "draft" | "live" | "completed";
  slides_file_name: string | null;
  slides: Slide[] | null;
  summary: Lecture["summary"];
  messages: ChatMessage[];
  created_at: string;
  updated_at: string;
};

function rowToLecture(r: LectureRow): Lecture {
  return {
    id: r.id,
    userId: r.user_id,
    subjectId: r.subject_id ?? "",
    title: r.title,
    transcript: r.transcript,
    durationSec: r.duration_sec,
    status: r.status,
    slidesFileName: r.slides_file_name ?? undefined,
    slides: r.slides ?? undefined,
    summary: r.summary ?? undefined,
    messages: r.messages ?? [],
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function listLecturesAsync(
  userId: string,
  subjectId?: string,
): Promise<Lecture[]> {
  if (!isSupabaseConfigured()) return localListLectures(userId, subjectId);
  try {
    const supabase = createClient();
    let q = supabase
      .from("lectures")
      .select(
        "id, user_id, subject_id, title, transcript, duration_sec, status, slides_file_name, slides, summary, messages, created_at, updated_at",
      )
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
      .select(
        "id, user_id, subject_id, title, transcript, duration_sec, status, slides_file_name, slides, summary, messages, created_at, updated_at",
      )
      .eq("id", id)
      .maybeSingle();
    return data ? rowToLecture(data as LectureRow) : null;
  } catch (err) {
    console.error("[db] getLecture fallback", err);
    return localGetLecture(userId, id);
  }
}

export async function createLectureAsync(
  userId: string,
  data: { subjectId: string; title: string },
): Promise<Lecture> {
  if (!isSupabaseConfigured()) {
    return localCreateLecture(userId, {
      subjectId: data.subjectId,
      title: data.title,
    });
  }
  const supabase = createClient();
  const { data: row, error } = await supabase
    .from("lectures")
    .insert({
      user_id: userId,
      subject_id: data.subjectId,
      title: data.title,
      transcript: "",
      duration_sec: 0,
      status: "draft",
      messages: [],
    })
    .select(
      "id, user_id, subject_id, title, transcript, duration_sec, status, slides_file_name, slides, summary, messages, created_at, updated_at",
    )
    .single();
  if (error || !row) throw error || new Error("Falha ao criar aula.");
  return rowToLecture(row as LectureRow);
}

export async function updateLectureAsync(
  userId: string,
  id: string,
  patch: Partial<Lecture>,
): Promise<Lecture | null> {
  if (!isSupabaseConfigured()) return localUpdateLecture(userId, id, patch);
  const supabase = createClient();
  // Translate camelCase → snake_case
  const dbPatch: Record<string, unknown> = {};
  if (patch.title !== undefined) dbPatch.title = patch.title;
  if (patch.transcript !== undefined) dbPatch.transcript = patch.transcript;
  if (patch.durationSec !== undefined) dbPatch.duration_sec = patch.durationSec;
  if (patch.status !== undefined) dbPatch.status = patch.status;
  if (patch.slidesFileName !== undefined)
    dbPatch.slides_file_name = patch.slidesFileName;
  if (patch.slides !== undefined) dbPatch.slides = patch.slides;
  if (patch.summary !== undefined) dbPatch.summary = patch.summary;
  if (patch.messages !== undefined) dbPatch.messages = patch.messages;
  if (Object.keys(dbPatch).length === 0) return getLectureAsync(userId, id);

  const { data, error } = await supabase
    .from("lectures")
    .update(dbPatch)
    .eq("id", id)
    .select(
      "id, user_id, subject_id, title, transcript, duration_sec, status, slides_file_name, slides, summary, messages, created_at, updated_at",
    )
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
