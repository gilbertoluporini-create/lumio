"use client";

/**
 * Lib do "Plano de Estudos" — trilha guiada.
 *
 * Schema: study_plans + study_plan_items (migration 026).
 * Items NÃO duplicam o asset; só apontam pra ele via asset_id (FK solta —
 * kind define em qual tabela buscar o conteúdo real).
 */

import { isSupabaseConfigured, createClient } from "./supabase/client";

export type StudyPlanStatus = "active" | "done" | "archived";

export type StudyPlanItemKind =
  | "document"
  | "summary"
  | "mindmap"
  | "quiz"
  | "flashcards"
  | "routine"
  | "note";

export type StudyPlanItemStatus =
  | "pending"
  | "in_progress"
  | "done"
  /** Aguardando o cron worker — item criado pelo wizard, source_document_id
   *  preenchido, mas ainda não gerou o asset (resumo/flashcards/quiz/mapa). */
  | "generating"
  /** Geração falhou (sem coins, parse fail, timeout). errorMessage explica. */
  | "failed";

export type StudyPlan = {
  id: string;
  userId: string;
  subjectId: string | null;
  title: string;
  examDate: string | null; // "YYYY-MM-DD"
  status: StudyPlanStatus;
  /** Kinds que o wizard pediu pra gerar (ex: ["summary","flashcards","quiz"]).
   *  Usado pelo wizard pra "regerar plano" reabrir com mesmas escolhas. */
  assetKinds: StudyPlanItemKind[];
  createdAt: string;
  updatedAt: string;
};

export type StudyPlanItem = {
  id: string;
  planId: string;
  position: number;
  kind: StudyPlanItemKind;
  assetId: string | null;
  title: string;
  description: string | null;
  status: StudyPlanItemStatus;
  dueAt: string | null;
  completedAt: string | null;
  /** Documento (PDF) que origina esse item. Cron worker lê pra gerar o asset. */
  sourceDocumentId: string | null;
  /** Aula gravada que origina esse item (alternativa ao sourceDocumentId).
   *  Cron worker usa lecture.transcript como source_text quando preenchido. */
  sourceLectureId: string | null;
  /** Motivo do failed (se aplica). */
  errorMessage: string | null;
  createdAt: string;
};

type StudyPlanRow = {
  id: string;
  user_id: string;
  subject_id: string | null;
  title: string;
  exam_date: string | null;
  status: StudyPlanStatus;
  asset_kinds: StudyPlanItemKind[] | null;
  created_at: string;
  updated_at: string;
};

type StudyPlanItemRow = {
  id: string;
  plan_id: string;
  position: number;
  kind: StudyPlanItemKind;
  asset_id: string | null;
  title: string;
  description: string | null;
  status: StudyPlanItemStatus;
  due_at: string | null;
  completed_at: string | null;
  source_document_id: string | null;
  source_lecture_id: string | null;
  error_message: string | null;
  created_at: string;
};

const PLAN_COLS =
  "id, user_id, subject_id, title, exam_date, status, asset_kinds, created_at, updated_at";
const ITEM_COLS =
  "id, plan_id, position, kind, asset_id, title, description, status, due_at, completed_at, source_document_id, source_lecture_id, error_message, created_at";

function rowToPlan(r: StudyPlanRow): StudyPlan {
  return {
    id: r.id,
    userId: r.user_id,
    subjectId: r.subject_id,
    title: r.title,
    examDate: r.exam_date,
    status: r.status,
    assetKinds: r.asset_kinds ?? [],
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function rowToItem(r: StudyPlanItemRow): StudyPlanItem {
  return {
    id: r.id,
    planId: r.plan_id,
    position: r.position,
    kind: r.kind,
    assetId: r.asset_id,
    title: r.title,
    description: r.description,
    status: r.status,
    dueAt: r.due_at,
    completedAt: r.completed_at,
    sourceDocumentId: r.source_document_id,
    sourceLectureId: r.source_lecture_id,
    errorMessage: r.error_message,
    createdAt: r.created_at,
  };
}

/* --------- Reads --------- */

export async function listPlansAsync(
  userId: string,
): Promise<StudyPlan[]> {
  if (!isSupabaseConfigured()) return [];
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("study_plans")
      .select(PLAN_COLS)
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data as StudyPlanRow[]).map(rowToPlan);
  } catch (err) {
    console.error("[study-plans] list failed", err);
    return [];
  }
}

export async function getPlanAsync(
  userId: string,
  id: string,
): Promise<{ plan: StudyPlan; items: StudyPlanItem[] } | null> {
  void userId; // RLS já filtra
  if (!isSupabaseConfigured()) return null;
  try {
    const supabase = createClient();
    const [{ data: planData }, { data: itemsData }] = await Promise.all([
      supabase.from("study_plans").select(PLAN_COLS).eq("id", id).maybeSingle(),
      supabase
        .from("study_plan_items")
        .select(ITEM_COLS)
        .eq("plan_id", id)
        .order("position", { ascending: true }),
    ]);
    if (!planData) return null;
    return {
      plan: rowToPlan(planData as StudyPlanRow),
      items: ((itemsData ?? []) as StudyPlanItemRow[]).map(rowToItem),
    };
  } catch (err) {
    console.error("[study-plans] get failed", err);
    return null;
  }
}

/* --------- Writes --------- */

export async function createPlanAsync(input: {
  userId: string;
  subjectId: string | null;
  title: string;
  examDate: string | null;
}): Promise<StudyPlan | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = createClient();
  const { data, error } = await supabase
    .from("study_plans")
    .insert({
      user_id: input.userId,
      subject_id: input.subjectId,
      title: input.title,
      exam_date: input.examDate,
    })
    .select(PLAN_COLS)
    .single();
  if (error) {
    console.error("[study-plans] create failed", error);
    throw error;
  }
  return rowToPlan(data as StudyPlanRow);
}

export async function updatePlanAsync(
  id: string,
  patch: Partial<{
    title: string;
    examDate: string | null;
    status: StudyPlanStatus;
  }>,
): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const supabase = createClient();
  const dbPatch: Record<string, unknown> = {};
  if ("title" in patch) dbPatch.title = patch.title;
  if ("examDate" in patch) dbPatch.exam_date = patch.examDate;
  if ("status" in patch) dbPatch.status = patch.status;
  if (Object.keys(dbPatch).length === 0) return;
  const { error } = await supabase
    .from("study_plans")
    .update(dbPatch)
    .eq("id", id);
  if (error) throw error;
}

export async function deletePlanAsync(id: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const supabase = createClient();
  const { error } = await supabase.from("study_plans").delete().eq("id", id);
  if (error) throw error;
}

export async function addItemAsync(input: {
  planId: string;
  kind: StudyPlanItemKind;
  title: string;
  description?: string;
  assetId?: string;
  position?: number;
  dueAt?: string | null;
}): Promise<StudyPlanItem | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = createClient();
  let position = input.position;
  if (typeof position !== "number") {
    const { data: last } = await supabase
      .from("study_plan_items")
      .select("position")
      .eq("plan_id", input.planId)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    position =
      last && typeof (last as { position: number }).position === "number"
        ? (last as { position: number }).position + 1
        : 0;
  }
  const { data, error } = await supabase
    .from("study_plan_items")
    .insert({
      plan_id: input.planId,
      kind: input.kind,
      title: input.title,
      description: input.description ?? null,
      asset_id: input.assetId ?? null,
      position,
      due_at: input.dueAt ?? null,
    })
    .select(ITEM_COLS)
    .single();
  if (error) {
    console.error("[study-plans] addItem failed", error);
    throw error;
  }
  return rowToItem(data as StudyPlanItemRow);
}

export async function updateItemStatusAsync(
  itemId: string,
  status: StudyPlanItemStatus,
): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const supabase = createClient();
  const patch: Record<string, unknown> = { status };
  if (status === "done") patch.completed_at = new Date().toISOString();
  else patch.completed_at = null;
  const { error } = await supabase
    .from("study_plan_items")
    .update(patch)
    .eq("id", itemId);
  if (error) throw error;
}

/**
 * Atualiza campos arbitrários de um item — usado depois de gerar um asset
 * (linka asset_id e marca status="done" em uma chamada só).
 */
export async function updateItemAsync(
  itemId: string,
  patch: Partial<{
    title: string;
    description: string | null;
    assetId: string | null;
    status: StudyPlanItemStatus;
  }>,
): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const supabase = createClient();
  const dbPatch: Record<string, unknown> = {};
  if ("title" in patch) dbPatch.title = patch.title;
  if ("description" in patch) dbPatch.description = patch.description;
  if ("assetId" in patch) dbPatch.asset_id = patch.assetId;
  if ("status" in patch) {
    dbPatch.status = patch.status;
    dbPatch.completed_at =
      patch.status === "done" ? new Date().toISOString() : null;
  }
  if (Object.keys(dbPatch).length === 0) return;
  const { error } = await supabase
    .from("study_plan_items")
    .update(dbPatch)
    .eq("id", itemId);
  if (error) throw error;
}

export async function deleteItemAsync(itemId: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const supabase = createClient();
  const { error } = await supabase
    .from("study_plan_items")
    .delete()
    .eq("id", itemId);
  if (error) throw error;
}

/* --------- Helpers --------- */

export function daysUntilExam(examDate: string | null): number | null {
  if (!examDate) return null;
  const exam = new Date(examDate + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffMs = exam.getTime() - today.getTime();
  return Math.ceil(diffMs / 86_400_000);
}

export function progressPercent(items: StudyPlanItem[]): number {
  if (items.length === 0) return 0;
  const done = items.filter((i) => i.status === "done").length;
  return Math.round((done / items.length) * 100);
}

/**
 * Mapeia um item (kind + assetId) pra rota onde o asset vive.
 * Retorna null quando o asset ainda não foi gerado/linkado.
 *
 * Nota: pra mindmap/quiz/flashcards, asset_id é o `lecture_assets.id`
 * (não o lecture.id) — é o que /deck/[assetId] etc. consultam.
 * Pra summary, asset_id é o `summaries.id` (rota /resumo/doc/[id]).
 * Pra document, asset_id é o `documents.id` (rota /documentos/[id]).
 */
export function assetHrefFor(item: StudyPlanItem): string | null {
  if (!item.assetId) return null;
  switch (item.kind) {
    case "flashcards":
      return `/deck/${item.assetId}`;
    case "mindmap":
      return `/mapa/${item.assetId}`;
    case "quiz":
      return `/quiz-banco/${item.assetId}`;
    case "summary":
      return `/resumo/doc/${item.assetId}`;
    case "document":
    case "routine":
      // Rotina é um Document especial (PDF cronograma) — /api/lumi/routine
      // retorna documentId e a rota /document/[id] renderiza ambos.
      return `/document/${item.assetId}`;
    default:
      return null;
  }
}

/** Kinds que podem ser gerados via algum fluxo "Gerar agora". */
export const GENERATABLE_KINDS: StudyPlanItemKind[] = [
  "summary",
  "mindmap",
  "quiz",
  "flashcards",
  "routine",
  "document",
];

/**
 * Kinds que o ContentWizard cobre. Outros (routine/document) usam fluxos
 * próprios — rotina chama /api/lumi/routine direto, documento abre upload.
 */
export const WIZARD_KINDS: StudyPlanItemKind[] = [
  "summary",
  "mindmap",
  "quiz",
  "flashcards",
];

export const ITEM_KIND_LABEL: Record<StudyPlanItemKind, string> = {
  document: "Documento",
  summary: "Resumo",
  mindmap: "Mapa mental",
  quiz: "Quiz",
  flashcards: "Flashcards",
  routine: "Rotina de estudo",
  note: "Nota livre",
};
