/**
 * GET /api/cron/proactive-notifications
 *
 * Cron diário (Vercel Cron, 14h BRT). Avalia condições por user e dispara
 * Web Push pra reter:
 *
 *   1) Provas em ~3 dias (study_plans com exam_date entre +2d e +4d).
 *   2) Pra cada plano:
 *      - Verifica se já enviou notif `exam_reminder` pro mesmo plan_id
 *        nas últimas 24h (idempotência via notifications_log.payload->plan_id).
 *      - Conta resumos/flashcards criados nos últimos 7d na MESMA matéria.
 *      - Sem atividade → push urgente ("Você tem X em 3 dias e ainda nem
 *        estudou. Quer 10 flashcards?").
 *      - Com atividade → push amigável ("Tá indo bem. Bora revisar?").
 *
 * Auth: header `x-internal-key` em timing-safe vs CRON_SECRET. Vercel Cron
 * também adiciona `Authorization: Bearer ${CRON_SECRET}` — aceitamos os 2.
 *
 * Resposta: `{ processed, sent, skipped }`.
 */
import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/server";
import { sendPushToUser } from "@/lib/web-push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

type StudyPlanRow = {
  id: string;
  user_id: string;
  subject_id: string | null;
  title: string | null;
  exam_date: string;
};

type SubjectRow = {
  id: string;
  name: string;
};

/** Compara strings em tempo constante (anti timing attack no CRON_SECRET). */
function safeEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return timingSafeEqual(ab, bb);
}

function isAuthorized(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET ?? "";
  if (!expected) {
    // Em dev sem CRON_SECRET, libera (mantém DX).
    return process.env.NODE_ENV !== "production";
  }
  const internal = req.headers.get("x-internal-key") ?? "";
  if (internal && safeEq(internal, expected)) return true;
  const auth = req.headers.get("authorization") ?? "";
  if (auth === `Bearer ${expected}`) return true;
  return false;
}

/** Retorna início e fim (ISO) da janela "daqui a 2-4 dias" pra capturar
 *  provas em ~3 dias (com tolerância de 1 dia pra cada lado). */
function examWindow(): { gte: string; lte: string } {
  const now = new Date();
  const gte = new Date(now);
  gte.setUTCDate(now.getUTCDate() + 2);
  gte.setUTCHours(0, 0, 0, 0);
  const lte = new Date(now);
  lte.setUTCDate(now.getUTCDate() + 4);
  lte.setUTCHours(23, 59, 59, 999);
  // exam_date é coluna `date` no DB — comparamos só pela parte YYYY-MM-DD.
  return {
    gte: gte.toISOString().slice(0, 10),
    lte: lte.toISOString().slice(0, 10),
  };
}

/** Diff em dias (inteiro positivo) entre hoje e exam_date (YYYY-MM-DD). */
function daysUntil(examDate: string): number {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const target = new Date(`${examDate}T00:00:00Z`);
  const diffMs = target.getTime() - today.getTime();
  return Math.max(0, Math.round(diffMs / (24 * 60 * 60 * 1000)));
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const stats = { processed: 0, sent: 0, skipped: 0 };

  // 1) Planos com prova em ~3 dias
  const window = examWindow();
  const { data: plans, error: plansErr } = await admin
    .from("study_plans")
    .select("id, user_id, subject_id, title, exam_date")
    .gte("exam_date", window.gte)
    .lte("exam_date", window.lte)
    .not("exam_date", "is", null);

  if (plansErr) {
    console.error("[cron/proactive-notifications] plans fetch failed", plansErr);
    return NextResponse.json(
      { error: plansErr.message, processed: 0, sent: 0, skipped: 0 },
      { status: 500 },
    );
  }

  const planList = (plans ?? []) as StudyPlanRow[];

  // Pré-fetch subjects pra evitar N+1
  const subjectIds = Array.from(
    new Set(planList.map((p) => p.subject_id).filter((x): x is string => !!x)),
  );
  const subjectMap = new Map<string, SubjectRow>();
  if (subjectIds.length > 0) {
    const { data: subjectsData } = await admin
      .from("subjects")
      .select("id, name")
      .in("id", subjectIds);
    for (const s of (subjectsData ?? []) as SubjectRow[]) {
      subjectMap.set(s.id, s);
    }
  }

  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const since7d = new Date(
    Date.now() - 7 * 24 * 60 * 60 * 1000,
  ).toISOString();

  for (const plan of planList) {
    stats.processed++;

    // 2a) Idempotência: já enviou exam_reminder pro mesmo plan_id nas
    //     últimas 24h?
    const { data: existingLogs } = await admin
      .from("notifications_log")
      .select("id")
      .eq("user_id", plan.user_id)
      .eq("type", "exam_reminder")
      .gte("dispatched_at", since24h)
      .filter("payload->>plan_id", "eq", plan.id)
      .limit(1);

    if (existingLogs && existingLogs.length > 0) {
      stats.skipped++;
      continue;
    }

    // 2b) Atividade recente na matéria (resumos + flashcards/quiz/mindmap
    //     da matéria nos últimos 7d). Sem subject_id, considera "sem atividade".
    let recentActivity = 0;
    if (plan.subject_id) {
      const [
        { count: summariesCount },
        { count: assetsCount },
      ] = await Promise.all([
        admin
          .from("summaries")
          .select("id", { count: "exact", head: true })
          .eq("user_id", plan.user_id)
          .eq("subject_id", plan.subject_id)
          .gte("created_at", since7d),
        admin
          .from("lecture_assets")
          .select("id", { count: "exact", head: true })
          .eq("user_id", plan.user_id)
          .gte("created_at", since7d),
      ]);
      recentActivity = (summariesCount ?? 0) + (assetsCount ?? 0);
    }

    const subject = plan.subject_id ? subjectMap.get(plan.subject_id) : null;
    const subjectName = subject?.name ?? plan.title ?? "sua prova";
    const n = daysUntil(plan.exam_date);
    const dayStr = n === 1 ? "1 dia" : `${n} dias`;

    let title: string;
    let body: string;
    if (recentActivity === 0) {
      // Urgente
      title = `Lumi: ${subjectName} em ${dayStr}`;
      body = `Você tem ${subjectName} em ${dayStr} e ainda não estudou. Quer 10 flashcards rapidinhos?`;
    } else {
      // Amigável
      title = `Lumi: revisão de ${subjectName}`;
      body = `Tá indo bem em ${subjectName} (${recentActivity} ${
        recentActivity === 1 ? "asset" : "assets"
      } na última semana). Bora revisar antes da prova?`;
    }

    const payload = {
      plan_id: plan.id,
      subject_id: plan.subject_id,
      exam_date: plan.exam_date,
      url: `/planos/${plan.id}`,
    };

    const result = await sendPushToUser({
      admin,
      userId: plan.user_id,
      title,
      body,
      type: "exam_reminder",
      payload,
    });

    if (result.sent > 0) {
      stats.sent++;
    } else {
      stats.skipped++;
    }
  }

  return NextResponse.json({
    ok: true,
    ...stats,
    ranAt: new Date().toISOString(),
  });
}
