"use client";

import { isSupabaseConfigured, createClient } from "./supabase/client";
import type { Folder } from "./types";

type FolderRow = {
  id: string;
  user_id: string;
  subject_id: string;
  parent_folder_id: string | null;
  name: string;
  position: number;
  created_at: string;
  updated_at: string;
};

function rowToFolder(r: FolderRow): Folder {
  return {
    id: r.id,
    userId: r.user_id,
    subjectId: r.subject_id,
    parentFolderId: r.parent_folder_id ?? undefined,
    name: r.name,
    position: r.position,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

const FOLDER_COLS =
  "id, user_id, subject_id, parent_folder_id, name, position, created_at, updated_at";

/**
 * Lista TODAS as pastas de uma matéria (toda a árvore). UI monta a árvore
 * a partir disso filtrando por parent_folder_id — evita N queries.
 */
export async function listFoldersBySubjectAsync(
  userId: string,
  subjectId: string,
): Promise<Folder[]> {
  if (!isSupabaseConfigured()) return [];
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("folders")
      .select(FOLDER_COLS)
      .eq("user_id", userId)
      .eq("subject_id", subjectId)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw error;
    return (data as FolderRow[] | null)?.map(rowToFolder) ?? [];
  } catch (err) {
    console.error("[folders] list failed", err);
    return [];
  }
}

export async function getFolderAsync(
  userId: string,
  folderId: string,
): Promise<Folder | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("folders")
      .select(FOLDER_COLS)
      .eq("user_id", userId)
      .eq("id", folderId)
      .maybeSingle();
    if (error) throw error;
    return data ? rowToFolder(data as FolderRow) : null;
  } catch (err) {
    console.error("[folders] get failed", err);
    return null;
  }
}

export async function createFolderAsync(input: {
  userId: string;
  subjectId: string;
  parentFolderId?: string | null;
  name: string;
}): Promise<Folder | null> {
  if (!isSupabaseConfigured()) return null;
  const name = input.name.trim();
  if (!name) return null;
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("folders")
      .insert({
        user_id: input.userId,
        subject_id: input.subjectId,
        parent_folder_id: input.parentFolderId ?? null,
        name,
      })
      .select(FOLDER_COLS)
      .single();
    if (error) throw error;
    return rowToFolder(data as FolderRow);
  } catch (err) {
    console.error("[folders] create failed", err);
    return null;
  }
}

export async function renameFolderAsync(
  userId: string,
  folderId: string,
  name: string,
): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  const trimmed = name.trim();
  if (!trimmed) return false;
  try {
    const supabase = createClient();
    const { error } = await supabase
      .from("folders")
      .update({ name: trimmed })
      .eq("user_id", userId)
      .eq("id", folderId);
    if (error) throw error;
    return true;
  } catch (err) {
    console.error("[folders] rename failed", err);
    return false;
  }
}

/**
 * Move uma pasta pra dentro de outra (ou pra raiz da matéria).
 * NÃO valida ciclos no client — o caller deve garantir que `newParentId`
 * não é descendente de `folderId`.
 */
export async function moveFolderAsync(
  userId: string,
  folderId: string,
  newParentFolderId: string | null,
): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  try {
    const supabase = createClient();
    const { error } = await supabase
      .from("folders")
      .update({ parent_folder_id: newParentFolderId })
      .eq("user_id", userId)
      .eq("id", folderId);
    if (error) throw error;
    return true;
  } catch (err) {
    console.error("[folders] move failed", err);
    return false;
  }
}

/**
 * Deleta uma pasta. Subpastas e assets dentro dela ficam com folder_id=null
 * (ON DELETE SET NULL no schema) — sobem pra raiz da matéria, não somem.
 */
export async function deleteFolderAsync(
  userId: string,
  folderId: string,
): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  try {
    const supabase = createClient();
    const { error } = await supabase
      .from("folders")
      .delete()
      .eq("user_id", userId)
      .eq("id", folderId);
    if (error) throw error;
    return true;
  } catch (err) {
    console.error("[folders] delete failed", err);
    return false;
  }
}

/**
 * Verifica se candidate é descendente de folderId (pra evitar ciclos ao
 * mover uma pasta pra dentro de uma própria subpasta).
 */
export function isDescendant(
  folders: Folder[],
  ancestorId: string,
  candidateId: string,
): boolean {
  if (ancestorId === candidateId) return true;
  const childrenByParent = new Map<string, Folder[]>();
  for (const f of folders) {
    const key = f.parentFolderId ?? "__root__";
    const arr = childrenByParent.get(key) ?? [];
    arr.push(f);
    childrenByParent.set(key, arr);
  }
  const stack = [...(childrenByParent.get(ancestorId) ?? [])];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    if (cur.id === candidateId) return true;
    stack.push(...(childrenByParent.get(cur.id) ?? []));
  }
  return false;
}

/**
 * Constrói o breadcrumb de uma pasta (do root até a pasta atual).
 * Retorna array vazio se folderId for null/undefined.
 */
export function buildBreadcrumb(folders: Folder[], folderId?: string): Folder[] {
  if (!folderId) return [];
  const byId = new Map(folders.map((f) => [f.id, f]));
  const path: Folder[] = [];
  let cur = byId.get(folderId);
  while (cur) {
    path.unshift(cur);
    cur = cur.parentFolderId ? byId.get(cur.parentFolderId) : undefined;
  }
  return path;
}
