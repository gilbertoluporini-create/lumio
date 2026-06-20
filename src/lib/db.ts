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
  Semester,
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
  semester_id: string | null;
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
    semesterId: r.semester_id ?? undefined,
    createdAt: r.created_at,
  };
}

const SUBJECT_COLS =
  "id, user_id, name, color, icon, schedule, semester_id, created_at";

/** Semestre ativo do user (null em DBs pré-053 ou user sem semestre). */
export async function getActiveSemesterIdAsync(
  userId: string,
): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const supabase = createClient();
    const { data } = await supabase
      .from("user_profiles")
      .select("active_semester_id")
      .eq("user_id", userId)
      .maybeSingle();
    return (data?.active_semester_id as string | null) ?? null;
  } catch {
    return null;
  }
}

/**
 * Lista as matérias do SEMESTRE ATIVO. Se o user não tem semestre ativo
 * (DB pré-053), cai pro comportamento antigo de listar todas — assim a
 * migração não esconde matéria de ninguém antes do backfill rodar.
 */
export async function listSubjectsAsync(userId: string): Promise<Subject[]> {
  if (!isSupabaseConfigured()) return localListSubjects(userId);
  try {
    const supabase = createClient();
    const activeSemesterId = await getActiveSemesterIdAsync(userId);
    let query = supabase
      .from("subjects")
      .select(SUBJECT_COLS)
      .order("created_at", { ascending: true });
    if (activeSemesterId) query = query.eq("semester_id", activeSemesterId);
    const { data, error } = await query;
    if (error) throw error;
    return (data as SubjectRow[]).map(rowToSubject);
  } catch (err) {
    console.error("[db] listSubjects fallback", err);
    return localListSubjects(userId);
  }
}

/** Lista todos os semestres do user, mais antigo → mais novo. */
export async function listSemestersAsync(userId: string): Promise<Semester[]> {
  if (!isSupabaseConfigured()) return [];
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("semesters")
      .select("id, user_id, name, created_at")
      .order("created_at", { ascending: true });
    if (error) throw error;
    return (
      data as Array<{
        id: string;
        user_id: string;
        name: string;
        created_at: string;
      }>
    ).map((r) => ({
      id: r.id,
      userId: r.user_id,
      name: r.name,
      createdAt: r.created_at,
    }));
  } catch (err) {
    console.error("[db] listSemesters", err);
    return [];
  }
}

/** Define o semestre ativo do user (upsert no profile). */
export async function setActiveSemesterAsync(
  userId: string,
  semesterId: string,
): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const supabase = createClient();
  const { error } = await supabase.from("user_profiles").upsert(
    {
      user_id: userId,
      active_semester_id: semesterId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) throw error;
}

/**
 * Garante que o user tenha um semestre ativo. Cria "Semestre atual" se não
 * houver nenhum (user novo, que não passou pelo backfill da 053). Chamado no
 * onboarding pra que toda matéria criada já caia num semestre desde o início.
 */
export async function ensureActiveSemesterAsync(
  userId: string,
): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;
  const existing = await getActiveSemesterIdAsync(userId);
  if (existing) return existing;
  // Tem semestre mas sem ativo (raro): ativa o mais recente em vez de duplicar.
  const list = await listSemestersAsync(userId);
  if (list.length > 0) {
    const last = list[list.length - 1].id;
    await setActiveSemesterAsync(userId, last);
    return last;
  }
  const sem = await createSemesterAsync(userId, "Semestre atual", {
    activate: true,
  });
  return sem.id;
}

/** Cria um semestre e (por padrão) já o torna o ativo. */
export async function createSemesterAsync(
  userId: string,
  name: string,
  opts?: { activate?: boolean },
): Promise<Semester> {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase não configurado — semestres exigem banco.");
  }
  const supabase = createClient();
  const { data, error } = await supabase
    .from("semesters")
    .insert({ user_id: userId, name })
    .select("id, user_id, name, created_at")
    .single();
  if (error || !data) throw error ?? new Error("Falha ao criar semestre.");
  const sem: Semester = {
    id: data.id as string,
    userId: data.user_id as string,
    name: data.name as string,
    createdAt: data.created_at as string,
  };
  if (opts?.activate !== false) await setActiveSemesterAsync(userId, sem.id);
  return sem;
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
  const activeSemesterId = await getActiveSemesterIdAsync(userId);
  const { data: row, error } = await supabase
    .from("subjects")
    .insert({
      user_id: userId,
      name: data.name,
      color: data.color,
      icon: data.icon ?? null,
      schedule: data.schedule ?? [],
      semester_id: activeSemesterId,
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
  const activeSemesterId = await getActiveSemesterIdAsync(userId);
  // Idempotente: pula matérias cujo nome já existe NO SEMESTRE ATIVO. O dedup
  // é escopado ao semestre senão criar "Cálculo I" num semestre novo seria
  // barrado por já ter existido em outro. Sem dedup nenhum, rodar o onboarding
  // 2x duplicava TODAS as matérias (incidente de 2026-05-27).
  let existingQuery = supabase.from("subjects").select("name");
  if (activeSemesterId) {
    existingQuery = existingQuery.eq("semester_id", activeSemesterId);
  }
  const { data: existing } = await existingQuery;
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
        semester_id: activeSemesterId,
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
  folder_id: string | null;
  title: string;
  transcript: string;
  transcript_entries: TranscriptEntry[] | null;
  transcript_insights: TranscriptInsights | null;
  transcript_chapters: import("@/lib/types").TranscriptChapters | null;
  summary_educational: { markdown: string; generatedAt: string; images?: import("@/lib/types").LectureSummaryImage[] } | null;
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
    folderId: r.folder_id ?? undefined,
    title: r.title,
    transcript: r.transcript,
    transcriptEntries: r.transcript_entries ?? undefined,
    transcriptInsights: r.transcript_insights ?? undefined,
    transcriptChapters: r.transcript_chapters ?? undefined,
    summaryEducational: r.summary_educational ?? undefined,
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
  "id, user_id, subject_id, folder_id, title, transcript, transcript_entries, transcript_insights, transcript_chapters, summary_educational, duration_sec, status, slides_file_name, slides, messages, audio_url, created_at, updated_at";

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
      .is("deleted_at", null)
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

/** Lista as aulas que estão na lixeira (soft-deletadas). Pra UI de
 *  restauração. Ordena por `deleted_at` descendente. */
export async function listDeletedLecturesAsync(
  userId: string,
): Promise<Array<Lecture & { deletedAt: string }>> {
  if (!isSupabaseConfigured()) return [];
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("lectures")
      .select(`${LECTURE_COLS}, deleted_at`)
      .not("deleted_at", "is", null)
      .order("deleted_at", { ascending: false });
    if (error) throw error;
    return ((data ?? []) as Array<LectureRow & { deleted_at: string }>).map(
      (r) => ({
        ...rowToLecture(r),
        deletedAt: r.deleted_at,
      }),
    );
  } catch (err) {
    console.error("[db] listDeletedLectures failed", err);
    return [];
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
      .is("deleted_at", null)
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
  data: {
    subjectId: string;
    title: string;
    folderId?: string | null;
    /** 'upload' inicia transcription_status='pending' pro overlay aparecer. */
    source?: "live" | "upload";
  },
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
      folderId: data.folderId ?? null,
      source: data.source ?? "live",
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
  if ("summaryEducational" in patch)
    dbPatch.summary_educational = patch.summaryEducational ?? null;
  if ("durationSec" in patch) dbPatch.duration_sec = patch.durationSec ?? null;
  if ("status" in patch) dbPatch.status = patch.status ?? null;
  if ("slidesFileName" in patch)
    dbPatch.slides_file_name = patch.slidesFileName ?? null;
  if ("slides" in patch) dbPatch.slides = patch.slides ?? null;
  if ("messages" in patch) dbPatch.messages = patch.messages ?? null;
  if ("audioUrl" in patch) dbPatch.audio_url = patch.audioUrl ?? null;
  if ("folderId" in patch) dbPatch.folder_id = patch.folderId ?? null;
  // BUG FIX 2026-05-31: subjectId estava sendo ignorado silenciosamente
  // no patch. updateSummaryAsync e updateDocumentAsync já aceitavam —
  // só updateLectureAsync estava de fora. Por isso mover AULA entre
  // matérias via MoveToFolderDialog deixava a lecture 'órfã' (folder
  // mudava, subject não — fica em pasta inexistente da matéria antiga).
  if ("subjectId" in patch) dbPatch.subject_id = patch.subjectId ?? null;
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

/** Soft-delete: marca deleted_at = now(). Aula some das listagens e do
 *  acesso direto mas a row, FKs filhas (summaries, flashcards, etc),
 *  áudio no Storage e mensagens do chat ficam intactos pra restore.
 *  Pra excluir DE VERDADE use `permanentDeleteLectureAsync`. */
export async function deleteLectureAsync(
  userId: string,
  id: string,
): Promise<void> {
  if (!isSupabaseConfigured()) {
    localDeleteLecture(userId, id);
    return;
  }
  const supabase = createClient();
  const ts = new Date().toISOString();
  const { error } = await supabase
    .from("lectures")
    .update({ deleted_at: ts })
    .eq("id", id);
  if (error) throw error;

  // Cascata: soft-delete dos filhos (resumos + assets) com o MESMO timestamp,
  // pra não deixar órfãos visíveis em /documentos e /favoritos (link morto).
  // Só carimba os que ainda estão vivos — assim o restore por timestamp não
  // ressuscita um filho que o user já tinha deletado individualmente.
  await supabase
    .from("lecture_assets")
    .update({ deleted_at: ts })
    .eq("lecture_id", id)
    .is("deleted_at", null);
  await supabase
    .from("summaries")
    .update({ deleted_at: ts })
    .eq("lecture_id", id)
    .is("deleted_at", null);
}

/** Restaura aula soft-deletada (deleted_at = NULL). */
export async function restoreLectureAsync(
  userId: string,
  id: string,
): Promise<Lecture | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = createClient();

  // Lê o timestamp de delete ANTES de restaurar, pra recuperar só os filhos
  // que foram cascateados nesse mesmo delete (mesmo deleted_at).
  const { data: cur } = await supabase
    .from("lectures")
    .select("deleted_at")
    .eq("id", id)
    .maybeSingle();
  const ts = (cur as { deleted_at: string | null } | null)?.deleted_at ?? null;

  const { data, error } = await supabase
    .from("lectures")
    .update({ deleted_at: null })
    .eq("id", id)
    .select(LECTURE_COLS)
    .single();
  if (error) throw error;

  if (ts) {
    await supabase
      .from("lecture_assets")
      .update({ deleted_at: null })
      .eq("lecture_id", id)
      .eq("deleted_at", ts);
    await supabase
      .from("summaries")
      .update({ deleted_at: null })
      .eq("lecture_id", id)
      .eq("deleted_at", ts);
  }

  return data ? rowToLecture(data as LectureRow) : null;
}

/** Excluir DE VERDADE — cascade nas FKs (summaries, lecture_assets etc).
 *  Operação irreversível, usar só no botão "Excluir permanentemente" da
 *  lixeira após confirmação dupla. */
export async function permanentDeleteLectureAsync(
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
