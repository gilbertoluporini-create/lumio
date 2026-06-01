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

/**
 * Normaliza título pra comparação em dedup. Remove extensão .pdf no fim,
 * espaços duplicados e caps. Mantém acentos e caracteres.
 */
function normalizeDocTitleForDedup(title: string): string {
  return title
    .trim()
    .replace(/\.pdf$/i, "")
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("pt-BR");
}

/**
 * Busca um documento PDF/text já existente do user com mesmo título
 * normalizado (e mesma matéria, se informada). Usado pra evitar duplicatas
 * quando o user re-sobe o mesmo PDF (ex: o wizard de "Gerar resumo com IA"
 * antes não checava e criava row nova a cada upload).
 *
 * Retorna o mais recente match ou null.
 */
export async function findExistingDocumentByTitleAsync(input: {
  userId: string;
  subjectId: string | null;
  title: string;
}): Promise<Document | null> {
  if (!isSupabaseConfigured()) return null;
  const target = normalizeDocTitleForDedup(input.title);
  if (!target) return null;
  try {
    const supabase = createClient();
    let query = supabase
      .from("documents")
      .select(DOCUMENT_COLS)
      .eq("user_id", input.userId)
      .order("created_at", { ascending: false });
    if (input.subjectId) query = query.eq("subject_id", input.subjectId);
    const { data, error } = await query;
    if (error) {
      console.error("[documents] dedup lookup failed", error);
      return null;
    }
    for (const row of (data ?? []) as DocumentRow[]) {
      const t = row.title ?? "";
      if (normalizeDocTitleForDedup(t) === target) {
        return rowToDocument(row);
      }
    }
    return null;
  } catch (err) {
    console.error("[documents] dedup query threw", err);
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

/**
 * Cria documento PDF a partir do arquivo anexado numa aula e sobe o binário
 * pro Storage. Faz dedupe por título+matéria+pasta — se já existe um doc com
 * mesmo nome de arquivo na mesma matéria/pasta, retorna o existente sem
 * duplicar (caso o user reanexe o mesmo PDF na mesma aula).
 *
 * Vínculo doc↔aula é só por matéria/pasta — não há lecture_id no schema
 * de documents. O user encontra ambos lado a lado em /documentos.
 *
 * Roda fire-and-forget no caller: nunca lança, só loga.
 */
export async function attachLecturePdfAsDocument(input: {
  userId: string;
  subjectId: string | null;
  folderId?: string | null;
  title: string;
  pageCount?: number;
  sourceText?: string;
  file: File;
}): Promise<Document | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = createClient();
  try {
    // Dedupe: mesmo título + matéria + pasta = mesmo doc
    let dedupeQuery = supabase
      .from("documents")
      .select(DOCUMENT_COLS)
      .eq("user_id", input.userId)
      .eq("title", input.title)
      .eq("source_kind", "pdf")
      .limit(1);
    if (input.subjectId) {
      dedupeQuery = dedupeQuery.eq("subject_id", input.subjectId);
    } else {
      dedupeQuery = dedupeQuery.is("subject_id", null);
    }
    if (input.folderId) {
      dedupeQuery = dedupeQuery.eq("folder_id", input.folderId);
    } else {
      dedupeQuery = dedupeQuery.is("folder_id", null);
    }
    const { data: existing } = await dedupeQuery.maybeSingle();
    if (existing) return rowToDocument(existing as DocumentRow);

    // Cria row primeiro pra ter o id no path do Storage
    const { data: inserted, error: insErr } = await supabase
      .from("documents")
      .insert({
        user_id: input.userId,
        subject_id: input.subjectId,
        folder_id: input.folderId ?? null,
        title: input.title,
        source_kind: "pdf",
        source_text: input.sourceText ?? null,
        page_count: input.pageCount ?? null,
      })
      .select(DOCUMENT_COLS)
      .single();
    if (insErr || !inserted) {
      console.error("[documents] attachLecturePdf insert failed", insErr);
      return null;
    }
    const doc = rowToDocument(inserted as DocumentRow);

    const storageKey = `${input.userId}/${doc.id}.pdf`;
    const { error: upErr } = await supabase.storage
      .from("user-documents")
      .upload(storageKey, input.file, {
        contentType: "application/pdf",
        upsert: true,
      });
    if (upErr) {
      console.error("[documents] attachLecturePdf upload failed", upErr);
      // Sem PDF físico — apaga row pra não ficar fantasma na /documentos
      await supabase.from("documents").delete().eq("id", doc.id);
      return null;
    }
    // Bucket é privado: gera signed URL com TTL longo (7d) pra persistir.
    // URLs in-page geram fresca on-demand quando precisar via createSignedUrl.
    const { data: signed, error: signedErr } = await supabase.storage
      .from("user-documents")
      .createSignedUrl(storageKey, 60 * 60 * 24 * 7);
    const signedUrl = signedErr || !signed ? null : signed.signedUrl;
    if (signedUrl) {
      await supabase
        .from("documents")
        .update({ source_url: signedUrl })
        .eq("id", doc.id);
      doc.sourceUrl = signedUrl;
    }
    return doc;
  } catch (err) {
    console.error("[documents] attachLecturePdf failed", err);
    return null;
  }
}
