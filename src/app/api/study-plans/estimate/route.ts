/**
 * POST /api/study-plans/estimate
 *
 * Calcula o custo em coins do plano antes de criar — pra mostrar estimativa
 * no último passo do wizard ("vai custar X coins, confirma?").
 *
 * Não cria nada. Não cobra nada. Não autentica (info pública de pricing).
 *
 * Body: { documentCount: number, assetKinds: StudyPlanItemKind[] }
 * Response: {
 *   total: number,
 *   breakdown: Array<{ kind, perItem, count, subtotal }>,
 *   itemsTotal: number,
 * }
 *
 * Exemplo: 3 PDFs + [summary, flashcards, quiz]:
 *   summary:    10 × 3 = 30
 *   flashcards:  8 × 3 = 24
 *   quiz:        8 × 3 = 24
 *   --------
 *   total: 78 coins · 9 items
 */

import { NextResponse, type NextRequest } from "next/server";
import { COIN_COSTS } from "@/lib/coins";
import type { StudyPlanItemKind } from "@/lib/study-plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KIND_COST: Partial<Record<StudyPlanItemKind, number>> = {
  summary: COIN_COSTS.summary,
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
  let body: { documentCount?: number; assetKinds?: StudyPlanItemKind[] };
  try {
    body = (await req.json()) as {
      documentCount?: number;
      assetKinds?: StudyPlanItemKind[];
    };
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const documentCount = Math.max(
    1,
    Math.min(20, Math.floor(body.documentCount ?? 0)),
  );
  const rawKinds = Array.isArray(body.assetKinds) ? body.assetKinds : [];

  // Filtra só kinds permitidos no wizard (não inclui routine, note, document)
  const assetKinds = rawKinds.filter((k): k is StudyPlanItemKind =>
    ALLOWED_KINDS.includes(k as StudyPlanItemKind),
  );

  if (assetKinds.length === 0) {
    return NextResponse.json({
      total: 0,
      breakdown: [],
      itemsTotal: 0,
      documentCount,
    });
  }

  const breakdown = assetKinds.map((kind) => {
    const perItem = KIND_COST[kind] ?? 0;
    return {
      kind,
      perItem,
      count: documentCount,
      subtotal: perItem * documentCount,
    };
  });

  const total = breakdown.reduce((acc, b) => acc + b.subtotal, 0);
  const itemsTotal = documentCount * assetKinds.length;

  return NextResponse.json({
    total,
    breakdown,
    itemsTotal,
    documentCount,
  });
}
