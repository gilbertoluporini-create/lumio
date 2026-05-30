"use client";

import { isSupabaseConfigured, createClient } from "./supabase/client";
import type { Document, DocumentSourceKind } from "./types";

type DocumentRow = {
  id: string;
  user_id: string;
  subject_id: string | null;
  folder_id: string | null;
  title: string;
  source_kind: DocumentSourceKind;
  source_url: string | null;
  source_text: string | null;
  page_count: number | null;
  created_at: string;
  updated_at: string;
};

function rowToDocument(r: DocumentRow): Document {
  return {
    id: r.id,
    userId: r.user_id,
    subjectId: r.subject_id ?? "",
    folderId: r.folder_id ?? undefined,
    title: r.title,
    sourceKind: r.source_kind,
    sourceUrl: r.source_url ?? undefined,
    sourceText: r.source_text ?? undefined,
    pageCount: r.page_count ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

const DOCUMENT_COLS =
  "id, user_id, subject_id, folder_id, title, source_kind, source_url, source_text, page_count, created_at, updated_at";

export async function listDocumentsAsync(
  userId: string,
  subjectId?: string,
): Promise<Document[]> {
  if (!isSupabaseConfigured()) return [];
  try {
    const supabase = createClient();
    let q = supabase
      .from("documents")
      .select(DOCUMENT_COLS)
      .order("created_at", { ascending: false });
    if (subjectId) q = q.eq("subject_id", subjectId);
    const { data, error } = await q;
    if (error) throw error;
    return (data as DocumentRow[]).map(rowToDocument);
  } catch (err) {
    console.error("[documents] list failed", err);
    return [];
  }
}

export async function getDocumentAsync(
  userId: string,
  id: string,
): Promise<Document | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const supabase = createClient();
    const { data } = await supabase
      .from("documents")
      .select(DOCUMENT_COLS)
      .eq("id", id)
      .maybeSingle();
    return data ? rowToDocument(data as DocumentRow) : null;
  } catch (err) {
    console.error("[documents] get failed", err);
    return null;
  }
}

export async function createDocumentAsync(input: {
  userId: string;
  subjectId: string | null;
  folderId?: string | null;
  title: string;
  sourceKind: DocumentSourceKind;
  sourceUrl?: string;
  sourceText?: string;
  pageCount?: number;
}): Promise<Document | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = createClient();
  const row: Partial<DocumentRow> = {
    user_id: input.userId,
    subject_id: input.subjectId,
    folder_id: input.folderId ?? null,
    title: input.title,
    source_kind: input.sourceKind,
    source_url: input.sourceUrl ?? null,
    source_text: input.sourceText ?? null,
    page_count: input.pageCount ?? null,
  };
  const { data, error } = await supabase
    .from("documents")
    .insert(row)
    .select(DOCUMENT_COLS)
    .single();
  if (error) {
    console.error("[documents] create failed", error);
    throw error;
  }
  return data ? rowToDocument(data as DocumentRow) : null;
}

export async function updateDocumentAsync(
  userId: string,
  id: string,
  patch: Partial<{
    title: string;
    subjectId: string | null;
    folderId: string | null;
    sourceText: string | null;
    pageCount: number | null;
  }>,
): Promise<Document | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = createClient();
  const dbPatch: Record<string, unknown> = {};
  if ("title" in patch) dbPatch.title = patch.title ?? null;
  if ("subjectId" in patch) dbPatch.subject_id = patch.subjectId ?? null;
  if ("folderId" in patch) dbPatch.folder_id = patch.folderId ?? null;
  if ("sourceText" in patch) dbPatch.source_text = patch.sourceText ?? null;
  if ("pageCount" in patch) dbPatch.page_count = patch.pageCount ?? null;
  if (Object.keys(dbPatch).length === 0) return getDocumentAsync(userId, id);
  const { data, error } = await supabase
    .from("documents")
    .update(dbPatch)
    .eq("id", id)
    .select(DOCUMENT_COLS)
    .single();
  if (error) throw error;
  return data ? rowToDocument(data as DocumentRow) : null;
}

export async function deleteDocumentAsync(
  userId: string,
  id: string,
): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const supabase = createClient();
  const { error } = await supabase.from("documents").delete().eq("id", id);
  if (error) throw error;
}
