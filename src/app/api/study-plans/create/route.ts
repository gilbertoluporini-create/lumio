/**
 * POST /api/study-plans/create
 *
 * Cria um plano de estudos completo a partir das escolhas do wizard.
 * Os PDFs já foram subidos antes (como rows em `documents`) — aqui só
 * recebemos os IDs e geramos os items pending pro cron worker processar.
 *
 * Não cobra coins aqui — coins são cobrados pelo cron quando cada item
 * for de fato gerado (mais justo: se falhar antes, não cobra).
 *
 * Body: {
 *   title, subjectId, examDate?, assetKinds: StudyPlanItemKind[],
 *
 *   // MODO TÓPICOS (preferido): user agrupou fontes em tópicos no wizard.
 *   // Cada tópico vira 1 item POR kind, com todas as sources concatenadas.
 *   topics?: Array<{
 *     title: string;                     // ex: "Hormônios sexuais"
 *     documentIds?: string[];            // PDFs do tópico
 *     lectureIds?: string[];             // aulas gravadas do tópico
 *   }>;
 *
 *   // MODO LEGACY (compat): listas flat. Cada source vira 1 tópico
 *   // implícito de 1 source só. Ignorado se `topics` for enviado.
 *   documentIds?: string[];
 *   lectureIds?: string[];
 * }
 *
 * Pelo menos 1 source no total é obrigatório.
 *
 * Response: { planId: string, itemsCreated: number }
 */

import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { getClientIp, limitOrThrow } from "@/lib/rate-limit";
import type { StudyPlanItemKind } from "@/lib/study-plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_KINDS: StudyPlanItemKind[] = [
  "summary",
  "flashcards",
  "quiz",
  "mindmap",
];

const KIND_LABEL: Record<StudyPlanItemKind, string> = {
  document: "Documento",
  summary: "Resumo",
  flashcards: "Flashcards",
  quiz: "Quiz",
  mindmap: "Mapa mental",
  routine: "Rotina",
  note: "Nota",
};

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const limited = limitOrThrow(`study-plans-create:ip:${ip}`, 5, 60_000);
  if (limited) return limited;

  type TopicInput = {
    title?: string;
    documentIds?: string[];
    lectureIds?: string[];
  };

  let body: {
    title?: string;
    subjectId?: string;
    examDate?: string;
    assetKinds?: StudyPlanItemKind[];
    topics?: TopicInput[];
    documentIds?: string[];
    lectureIds?: string[];
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const title = (body.title ?? "").trim();
  const subjectId = body.subjectId ?? "";
  const examDate = body.examDate ?? null;
  const rawKinds = Array.isArray(body.assetKinds) ? body.assetKinds : [];

  // Normaliza pra estrutura de tópicos. Se vier `topics`, usa direto. Senão,
  // gera tópicos implícitos (1 por source) a partir dos arrays flat — mantém
  // backward-compat com chamadas antigas do wizard.
  type Topic = {
    title: string;
    documentIds: string[];
    lectureIds: string[];
  };
  const topics: Topic[] = [];
  if (Array.isArray(body.topics) && body.topics.length > 0) {
    for (const t of body.topics) {
      const docIds = Array.isArray(t.documentIds) ? t.documentIds : [];
      const lecIds = Array.isArray(t.lectureIds) ? t.lectureIds : [];
      if (docIds.length === 0 && lecIds.length === 0) continue;
      topics.push({
        title: (t.title ?? "").trim() || "Tópico sem nome",
        documentIds: docIds,
        lectureIds: lecIds,
      });
    }
  } else {
    const flatDocIds = Array.isArray(body.documentIds) ? body.documentIds : [];
    const flatLecIds = Array.isArray(body.lectureIds) ? body.lectureIds : [];
    for (const d of flatDocIds) {
      topics.push({ title: "", documentIds: [d], lectureIds: [] });
    }
    for (const l of flatLecIds) {
      topics.push({ title: "", documentIds: [], lectureIds: [l] });
    }
  }

  // IDs únicos pra validar ownership em uma única query cada.
  const allDocIds = Array.from(
    new Set(topics.flatMap((t) => t.documentIds)),
  );
  const allLecIds = Array.from(
    new Set(topics.flatMap((t) => t.lectureIds)),
  );

  if (!title) {
    return NextResponse.json({ error: "Título obrigatório." }, { status: 400 });
  }
  if (!subjectId) {
    return NextResponse.json({ error: "Matéria obrigatória." }, { status: 400 });
  }
  if (topics.length === 0) {
    return NextResponse.json(
      { error: "Anexe ao menos 1 PDF ou aula." },
      { status: 400 },
    );
  }
  if (topics.length > 20) {
    return NextResponse.json(
      { error: "Máximo 20 tópicos por plano." },
      { status: 400 },
    );
  }
  const totalSources = allDocIds.length + allLecIds.length;
  if (totalSources > 50) {
    return NextResponse.json(
      { error: "Máximo 50 fontes (PDFs + aulas) por plano." },
      { status: 400 },
    );
  }

  const assetKinds = rawKinds.filter((k): k is StudyPlanItemKind =>
    ALLOWED_KINDS.includes(k as StudyPlanItemKind),
  );
  if (assetKinds.length === 0) {
    return NextResponse.json(
      { error: "Escolha ao menos 1 tipo de asset." },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Faça login." }, { status: 401 });
  }
  const userId = user.id;

  const admin = createAdminClient();

  // Valida ownership da matéria e dos documents (anti-abuse)
  const { data: subjectRow, error: subjErr } = await admin
    .from("subjects")
    .select("id")
    .eq("id", subjectId)
    .eq("user_id", userId)
    .maybeSingle();
  if (subjErr || !subjectRow) {
    return NextResponse.json({ error: "Matéria não encontrada." }, { status: 404 });
  }

  let docs: Array<{ id: string; title: string }> = [];
  if (allDocIds.length > 0) {
    const { data: docsRaw, error: docsErr } = await admin
      .from("documents")
      .select("id, title")
      .in("id", allDocIds)
      .eq("user_id", userId);
    if (docsErr) {
      return NextResponse.json({ error: docsErr.message }, { status: 500 });
    }
    docs = (docsRaw ?? []) as Array<{ id: string; title: string }>;
    if (docs.length !== allDocIds.length) {
      return NextResponse.json(
        { error: "Um ou mais documentos não foram encontrados." },
        { status: 404 },
      );
    }
  }

  let lectures: Array<{ id: string; title: string }> = [];
  if (allLecIds.length > 0) {
    const { data: lecsRaw, error: lecsErr } = await admin
      .from("lectures")
      .select("id, title")
      .in("id", allLecIds)
      .eq("user_id", userId);
    if (lecsErr) {
      return NextResponse.json({ error: lecsErr.message }, { status: 500 });
    }
    lectures = (lecsRaw ?? []) as Array<{ id: string; title: string }>;
    if (lectures.length !== allLecIds.length) {
      return NextResponse.json(
        { error: "Uma ou mais aulas não foram encontradas." },
        { status: 404 },
      );
    }
  }

  // 1) Cria o plano
  const { data: planRow, error: planErr } = await admin
    .from("study_plans")
    .insert({
      user_id: userId,
      subject_id: subjectId,
      title,
      exam_date: examDate,
      status: "active",
      asset_kinds: assetKinds,
    })
    .select("id")
    .single();
  if (planErr || !planRow) {
    return NextResponse.json(
      { error: planErr?.message ?? "Falha ao criar plano." },
      { status: 500 },
    );
  }
  const planId = (planRow as { id: string }).id;

  // 2) Monta items: pra cada TÓPICO, gera 1 item por kind selecionado.
  //    Cada item tem todas as sources do tópico em arrays (worker concatena).
  //    Mantém singulares preenchidos com o primeiro de cada array pra compat
  //    com queries antigas que esperam source_document_id/source_lecture_id.
  type ItemInsert = {
    plan_id: string;
    position: number;
    kind: StudyPlanItemKind;
    source_document_id: string | null;
    source_lecture_id: string | null;
    source_document_ids: string[];
    source_lecture_ids: string[];
    title: string;
    description: string;
    status: "pending";
  };
  const itemsToInsert: ItemInsert[] = [];

  let position = 0;
  for (const topic of topics) {
    // Resolve título do tópico — se vier vazio, usa o título da primeira source.
    let topicTitle = topic.title;
    if (!topicTitle || topicTitle === "Tópico sem nome") {
      const firstDoc = topic.documentIds[0]
        ? docs.find((d) => d.id === topic.documentIds[0])
        : null;
      const firstLec = topic.lectureIds[0]
        ? lectures.find((l) => l.id === topic.lectureIds[0])
        : null;
      topicTitle = firstDoc?.title ?? firstLec?.title ?? "Tópico";
    }

    const docTitles = topic.documentIds
      .map((id) => docs.find((d) => d.id === id)?.title)
      .filter(Boolean) as string[];
    const lecTitles = topic.lectureIds
      .map((id) => lectures.find((l) => l.id === id)?.title)
      .filter(Boolean) as string[];

    const sourceLine = [
      docTitles.length > 0 ? `${docTitles.length} PDF(s)` : null,
      lecTitles.length > 0 ? `${lecTitles.length} aula(s)` : null,
    ]
      .filter(Boolean)
      .join(" + ");

    for (const kind of assetKinds) {
      itemsToInsert.push({
        plan_id: planId,
        position: position++,
        kind,
        // Singulares: primeiro elemento de cada array (compat).
        source_document_id: topic.documentIds[0] ?? null,
        source_lecture_id: topic.lectureIds[0] ?? null,
        source_document_ids: topic.documentIds,
        source_lecture_ids: topic.lectureIds,
        title: `${KIND_LABEL[kind]} — ${topicTitle}`,
        description: `Gerado a partir de: ${sourceLine}.`,
        status: "pending",
      });
    }
  }

  if (itemsToInsert.length === 0) {
    // Cleanup: deleta plano vazio (não deveria acontecer dado as validações acima)
    await admin.from("study_plans").delete().eq("id", planId);
    return NextResponse.json(
      { error: "Nenhum item gerado — verifique PDFs e kinds." },
      { status: 400 },
    );
  }

  const { error: insErr } = await admin
    .from("study_plan_items")
    .insert(itemsToInsert);
  if (insErr) {
    await admin.from("study_plans").delete().eq("id", planId);
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  return NextResponse.json({
    planId,
    itemsCreated: itemsToInsert.length,
  });
}
