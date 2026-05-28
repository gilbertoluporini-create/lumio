"use client";

import { isSupabaseConfigured, createClient } from "./supabase/client";
import type {
  LectureSummary,
  LectureSummaryImage,
  Summary,
  SummarySource,
} from "./types";

type SummaryRow = {
  id: string;
  user_id: string;
  subject_id: string | null;
  lecture_id: string | null;
  document_id: string | null;
  title: string;
  content: LectureSummary;
  images: LectureSummaryImage[] | null;
  created_at: string;
  updated_at: string;
};

function rowToSummary(r: SummaryRow): Summary {
  const source: SummarySource = r.lecture_id
    ? { kind: "lecture", lectureId: r.lecture_id }
    : { kind: "document", documentId: r.document_id! };
  return {
    id: r.id,
    userId: r.user_id,
    subjectId: r.subject_id ?? "",
    title: r.title,
    source,
    content: r.content,
    images: r.images ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

const SUMMARY_COLS =
  "id, user_id, subject_id, lecture_id, document_id, title, content, images, created_at, updated_at";

// Todas as leituras filtram deleted_at IS NULL. Quando um resumo é deletado
// (soft-delete via deleteSummaryAsync), ele some das listagens mas o row
// continua no banco pra possível recuperação via restoreSummaryAsync.
// Sem esse filtro, /resumos continuava mostrando resumos deletados e clicar
// num deles abria conteúdo fantasma (já experiência reportada pelo user).

export async function listSummariesAsync(
  userId: string,
  subjectId?: string,
): Promise<Summary[]> {
  if (!isSupabaseConfigured()) return [];
  try {
    const supabase = createClient();
    let q = supabase
      .from("summaries")
      .select(SUMMARY_COLS)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (subjectId) q = q.eq("subject_id", subjectId);
    const { data, error } = await q;
    if (error) throw error;
    return (data as SummaryRow[]).map(rowToSummary);
  } catch (err) {
    console.error("[summaries] list failed", err);
    return [];
  }
}

export async function getSummaryAsync(
  userId: string,
  id: string,
): Promise<Summary | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const supabase = createClient();
    const { data } = await supabase
      .from("summaries")
      .select(SUMMARY_COLS)
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();
    return data ? rowToSummary(data as SummaryRow) : null;
  } catch (err) {
    console.error("[summaries] get failed", err);
    return null;
  }
}

export async function getSummaryByLectureIdAsync(
  userId: string,
  lectureId: string,
): Promise<Summary | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const supabase = createClient();
    const { data } = await supabase
      .from("summaries")
      .select(SUMMARY_COLS)
      .eq("lecture_id", lectureId)
      .is("deleted_at", null)
      .maybeSingle();
    return data ? rowToSummary(data as SummaryRow) : null;
  } catch (err) {
    console.error("[summaries] getByLecture failed", err);
    return null;
  }
}

export async function createSummaryAsync(input: {
  userId: string;
  subjectId: string | null;
  source: SummarySource;
  title: string;
  content: LectureSummary;
  images?: LectureSummaryImage[];
}): Promise<Summary | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = createClient();
  const row: Partial<SummaryRow> = {
    user_id: input.userId,
    subject_id: input.subjectId,
    lecture_id: input.source.kind === "lecture" ? input.source.lectureId : null,
    document_id:
      input.source.kind === "document" ? input.source.documentId : null,
    title: input.title,
    content: input.content,
    images: input.images ?? null,
  };
  const { data, error } = await supabase
    .from("summaries")
    .insert(row)
    .select(SUMMARY_COLS)
    .single();
  if (error) {
    console.error("[summaries] create failed", error);
    throw error;
  }
  return data ? rowToSummary(data as SummaryRow) : null;
}

export async function upsertSummaryByLectureAsync(input: {
  userId: string;
  subjectId: string | null;
  lectureId: string;
  title: string;
  content: LectureSummary;
  images?: LectureSummaryImage[];
}): Promise<Summary | null> {
  const existing = await getSummaryByLectureIdAsync(
    input.userId,
    input.lectureId,
  );
  if (!existing) {
    return createSummaryAsync({
      userId: input.userId,
      subjectId: input.subjectId,
      source: { kind: "lecture", lectureId: input.lectureId },
      title: input.title,
      content: input.content,
      images: input.images,
    });
  }
  return updateSummaryAsync(input.userId, existing.id, {
    title: input.title,
    content: input.content,
    images: input.images,
  });
}

export async function updateSummaryAsync(
  userId: string,
  id: string,
  patch: Partial<{
    title: string;
    content: LectureSummary;
    images: LectureSummaryImage[] | null;
  }>,
): Promise<Summary | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = createClient();
  const dbPatch: Record<string, unknown> = {};
  if ("title" in patch) dbPatch.title = patch.title ?? null;
  if ("content" in patch) dbPatch.content = patch.content;
  if ("images" in patch) dbPatch.images = patch.images ?? null;
  if (Object.keys(dbPatch).length === 0) return getSummaryAsync(userId, id);
  const { data, error } = await supabase
    .from("summaries")
    .update(dbPatch)
    .eq("id", id)
    .select(SUMMARY_COLS)
    .single();
  if (error) throw error;
  return data ? rowToSummary(data as SummaryRow) : null;
}

export async function deleteSummaryAsync(
  userId: string,
  id: string,
): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const supabase = createClient();
  // Soft-delete — marca como deletado mas preserva a linha pra:
  //  (a) o Lumi avisar "você apagou esse resumo, quer regerar/recuperar?"
  //  (b) recuperação rápida sem regerar (custo zero)
  // Listagens normais filtram por deleted_at IS NULL.
  const { error } = await supabase
    .from("summaries")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

/** Restaura um resumo soft-deleted (UPDATE deleted_at = NULL). */
export async function restoreSummaryAsync(
  userId: string,
  id: string,
): Promise<Summary | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = createClient();
  const { data, error } = await supabase
    .from("summaries")
    .update({ deleted_at: null })
    .eq("id", id)
    .select(SUMMARY_COLS)
    .single();
  if (error) throw error;
  return data ? rowToSummary(data as SummaryRow) : null;
}

/**
 * Busca summary SOFT-DELETED pra uma lecture. Usado quando a UI quer
 * oferecer recuperação ao user ("você deletou esse resumo, quer recuperar
 * ou regerar?").
 *
 * Não filtra deleted_at IS NULL — explicitamente busca DELETADOS.
 */
export async function getDeletedSummaryByLectureIdAsync(
  userId: string,
  lectureId: string,
): Promise<Summary | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const supabase = createClient();
    const { data } = await supabase
      .from("summaries")
      .select(SUMMARY_COLS)
      .eq("lecture_id", lectureId)
      .not("deleted_at", "is", null)
      .order("deleted_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return data ? rowToSummary(data as SummaryRow) : null;
  } catch (err) {
    console.error("[summaries] getDeleted failed", err);
    return null;
  }
}
