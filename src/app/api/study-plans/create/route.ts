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
 *   title: string,
 *   subjectId: string,
 *   examDate?: string,         // "YYYY-MM-DD"
 *   assetKinds: StudyPlanItemKind[],   // ["summary","flashcards",...]
 *   documentIds: string[],     // PDFs já subidos
 * }
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

  let body: {
    title?: string;
    subjectId?: string;
    examDate?: string;
    assetKinds?: StudyPlanItemKind[];
    documentIds?: string[];
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
  const documentIds = Array.isArray(body.documentIds) ? body.documentIds : [];

  if (!title) {
    return NextResponse.json({ error: "Título obrigatório." }, { status: 400 });
  }
  if (!subjectId) {
    return NextResponse.json({ error: "Matéria obrigatória." }, { status: 400 });
  }
  if (documentIds.length === 0) {
    return NextResponse.json(
      { error: "Anexe ao menos 1 PDF." },
      { status: 400 },
    );
  }
  if (documentIds.length > 20) {
    return NextResponse.json(
      { error: "Máximo 20 PDFs por plano." },
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

  const { data: docsRaw, error: docsErr } = await admin
    .from("documents")
    .select("id, title")
    .in("id", documentIds)
    .eq("user_id", userId);
  const docs = (docsRaw ?? []) as Array<{ id: string; title: string }>;
  if (docsErr) {
    return NextResponse.json({ error: docsErr.message }, { status: 500 });
  }
  if (docs.length !== documentIds.length) {
    return NextResponse.json(
      { error: "Um ou mais documentos não foram encontrados." },
      { status: 404 },
    );
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

  // 2) Monta items: pra cada PDF, gera 1 item por kind escolhido.
  //    Ordenação: documento1.kind1, documento1.kind2, ... documento2.kind1, ...
  //    Items começam status='pending' — cron worker pega depois.
  const itemsToInsert: Array<{
    plan_id: string;
    position: number;
    kind: StudyPlanItemKind;
    source_document_id: string;
    title: string;
    description: string;
    status: "pending";
  }> = [];

  let position = 0;
  // Preserva ordem em que o user enviou os documentIds
  for (const docId of documentIds) {
    const doc = docs.find((d) => d.id === docId);
    if (!doc) continue;
    for (const kind of assetKinds) {
      itemsToInsert.push({
        plan_id: planId,
        position: position++,
        kind,
        source_document_id: doc.id,
        title: `${KIND_LABEL[kind]} de ${doc.title}`,
        description: `Gerado automaticamente a partir do PDF: ${doc.title}`,
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
