/**
 * GET /api/exam-relevance?asset_type=lecture|document|summary&asset_id=<uuid>
 *
 * Retorna a prova MAIS PRÓXIMA na janela de 7 dias na qual o asset
 * apontado tem relevância pré-calculada (tabela `exam_lecture_relevance`,
 * populada pelo cron `/api/cron/exam-relevance`).
 *
 * Resposta:
 *   { relevance: { exam_id, exam_title, days_until, relevance_score } | null }
 *
 * Auth: sessão (cookie). RLS já cobre a tabela, mas a query também escopa
 * por user_id pra deixar explícito.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AssetType = "lecture" | "document" | "summary";

function isValidAssetType(s: string | null): s is AssetType {
  return s === "lecture" || s === "document" || s === "summary";
}

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

function daysUntil(examDateIso: string): number {
  const exam = new Date(examDateIso + "T00:00:00Z");
  const now = new Date();
  const today = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  return Math.round((exam.getTime() - today) / (24 * 60 * 60 * 1000));
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const assetType = url.searchParams.get("asset_type");
  const assetId = url.searchParams.get("asset_id");

  if (!isValidAssetType(assetType)) {
    return NextResponse.json(
      { error: "asset_type inválido (use lecture | document | summary)" },
      { status: 400 },
    );
  }
  if (!assetId || !isUuid(assetId)) {
    return NextResponse.json(
      { error: "asset_id ausente ou não-uuid" },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // Coluna do alvo no exam_lecture_relevance
  const targetCol =
    assetType === "lecture"
      ? "lecture_id"
      : assetType === "document"
        ? "document_id"
        : "summary_id";

  // Busca todas as relevâncias do user pra este asset, juntando o plano
  // pra filtrar por exam_date <= now() + 7d.
  // Pega o exam_date+title via subselect pra evitar join manual.
  const { data: rows, error } = await admin
    .from("exam_lecture_relevance")
    .select(
      "exam_id, relevance_score, study_plans:exam_id(title, exam_date, status)",
    )
    .eq("user_id", user.id)
    .eq(targetCol, assetId);

  if (error) {
    console.error("[exam-relevance] select failed", error);
    return NextResponse.json({ relevance: null });
  }

  type Row = {
    exam_id: string;
    relevance_score: number;
    study_plans: { title: string; exam_date: string | null; status: string } | null;
  };
  const list = (rows ?? []) as Row[];

  const now = Date.now();
  const todayUtc = (() => {
    const d = new Date();
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  })();
  const horizonMs = 7 * 24 * 60 * 60 * 1000;

  const candidates = list
    .map((r) => {
      const plan = r.study_plans;
      if (!plan || !plan.exam_date) return null;
      if (plan.status === "archived" || plan.status === "done") return null;
      const examMs = new Date(plan.exam_date + "T00:00:00Z").getTime();
      if (isNaN(examMs)) return null;
      // Só janela [hoje, hoje+7d]
      if (examMs < todayUtc) return null;
      if (examMs - todayUtc > horizonMs) return null;
      return {
        exam_id: r.exam_id,
        exam_title: plan.title,
        exam_date: plan.exam_date,
        relevance_score: Number(r.relevance_score),
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  // Mais próxima primeiro (menor days_until)
  candidates.sort(
    (a, b) =>
      new Date(a.exam_date).getTime() - new Date(b.exam_date).getTime(),
  );

  void now;
  const top = candidates[0];
  if (!top) {
    return NextResponse.json({ relevance: null });
  }

  return NextResponse.json({
    relevance: {
      exam_id: top.exam_id,
      exam_title: top.exam_title,
      days_until: daysUntil(top.exam_date),
      relevance_score: top.relevance_score,
    },
  });
}
