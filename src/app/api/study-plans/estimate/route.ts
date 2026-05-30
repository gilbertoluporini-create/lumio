/**
 * POST /api/study-plans/estimate
 *
 * Calcula o custo em coins do plano antes de criar — pra mostrar estimativa
 * no último passo do wizard ("vai custar X coins, confirma?").
 *
 * Custo do RESUMO é DINÂMICO: proporcional ao tamanho do material-fonte
 * (~1 coin / 10k chars, piso 5, teto 30). Os outros 3 kinds (flashcards/
 * quiz/mindmap) ainda usam preço fixo até serem implementados no worker.
 *
 * Não cria nada. Não cobra nada.
 *
 * Body: {
 *   documentIds: string[],
 *   lectureIds:  string[],
 *   assetKinds:  StudyPlanItemKind[]
 * }
 *
 * Response: {
 *   total: number,
 *   itemsTotal: number,
 *   breakdown: Array<{ kind, count, subtotal, avgPerItem }>,
 *   perSource: Array<{ id, title, kind: 'document' | 'lecture', chars, summaryCoins }>,
 * }
 */

import { NextResponse, type NextRequest } from "next/server";
import { calculateSummaryCoins, COIN_COSTS } from "@/lib/coin-costs";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import type { StudyPlanItemKind } from "@/lib/study-plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FIXED_KIND_COST: Partial<Record<StudyPlanItemKind, number>> = {
  flashcards: COIN_COSTS.flashcards,
  quiz: COIN_COSTS.quiz,
  mindmap: COIN_COSTS.mindmap,
};

const ALLOWED_KINDS: StudyPlanItemKind[] = [
  "summary",
  "flashcards",
  "quiz",
  "mindmap",
];

export async function POST(req: NextRequest) {
  let body: {
    documentIds?: string[];
    lectureIds?: string[];
    assetKinds?: StudyPlanItemKind[];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Faça login." }, { status: 401 });
  }

  const documentIds = (Array.isArray(body.documentIds) ? body.documentIds : [])
    .filter((id) => typeof id === "string" && id.length > 0)
    .slice(0, 20);
  const lectureIds = (Array.isArray(body.lectureIds) ? body.lectureIds : [])
    .filter((id) => typeof id === "string" && id.length > 0)
    .slice(0, 20);

  const totalSources = documentIds.length + lectureIds.length;
  if (totalSources === 0) {
    return NextResponse.json({
      total: 0,
      itemsTotal: 0,
      breakdown: [],
      perSource: [],
    });
  }

  const rawKinds = Array.isArray(body.assetKinds) ? body.assetKinds : [];
  const assetKinds = rawKinds.filter((k): k is StudyPlanItemKind =>
    ALLOWED_KINDS.includes(k as StudyPlanItemKind),
  );

  if (assetKinds.length === 0) {
    return NextResponse.json({
      total: 0,
      itemsTotal: 0,
      breakdown: [],
      perSource: [],
    });
  }

  // Lê o tamanho do texto-fonte de cada item (ownership-checked).
  const admin = createAdminClient();
  type SourceInfo = {
    id: string;
    title: string;
    kind: "document" | "lecture";
    chars: number;
    summaryCoins: number;
  };
  const perSource: SourceInfo[] = [];

  if (documentIds.length > 0) {
    const { data: docs } = await admin
      .from("documents")
      .select("id, title, source_text")
      .eq("user_id", user.id)
      .in("id", documentIds);
    for (const row of (docs ?? []) as Array<{
      id: string;
      title: string;
      source_text: string | null;
    }>) {
      const chars = row.source_text?.length ?? 0;
      perSource.push({
        id: row.id,
        title: row.title,
        kind: "document",
        chars,
        summaryCoins: calculateSummaryCoins(chars),
      });
    }
  }

  if (lectureIds.length > 0) {
    const { data: lecs } = await admin
      .from("lectures")
      .select("id, title, transcript")
      .eq("user_id", user.id)
      .in("id", lectureIds);
    for (const row of (lecs ?? []) as Array<{
      id: string;
      title: string;
      transcript: string | null;
    }>) {
      const chars = row.transcript?.length ?? 0;
      perSource.push({
        id: row.id,
        title: row.title,
        kind: "lecture",
        chars,
        summaryCoins: calculateSummaryCoins(chars),
      });
    }
  }

  // Breakdown agregado por kind.
  const breakdown = assetKinds.map((kind) => {
    let subtotal = 0;
    if (kind === "summary") {
      subtotal = perSource.reduce((acc, s) => acc + s.summaryCoins, 0);
    } else {
      const per = FIXED_KIND_COST[kind] ?? 0;
      subtotal = per * perSource.length;
    }
    const count = perSource.length;
    return {
      kind,
      count,
      subtotal,
      avgPerItem: count > 0 ? Math.round(subtotal / count) : 0,
    };
  });

  const total = breakdown.reduce((acc, b) => acc + b.subtotal, 0);
  const itemsTotal = perSource.length * assetKinds.length;

  return NextResponse.json({
    total,
    itemsTotal,
    breakdown,
    perSource,
  });
}
