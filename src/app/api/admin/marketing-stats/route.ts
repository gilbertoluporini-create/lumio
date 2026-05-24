/**
 * GET /api/admin/marketing-stats
 *
 * Métricas de funil de vendas, MRR, mix de planos, churn e cohorts.
 * Apenas admin.
 *
 * Retorna:
 *  - funnel30d         { signups, activated, checkoutStarted, paid }
 *  - mrrNow / mrr30dAgo / mrrTrendPct
 *  - planMix           [{ plan, count, mrr }]
 *  - churn30d          { canceled, baseStart, rate }
 *  - conversionRate30d (signups → paid)
 *  - cohorts           8 últimas semanas: [{ weekStart, signups, converted, rate }]
 */

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/server";
import { PLAN_PRICES_BRL } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// MRR equivalente mensal por plano (annual ÷ 12).
const PLAN_MRR_BRL: Record<string, number> = {
  starter: PLAN_PRICES_BRL.starter.monthly,
  pro: PLAN_PRICES_BRL.pro.monthly,
  power: PLAN_PRICES_BRL.power.monthly,
  // "annual" no DB = plano pro anual legado (R$690/ano = R$57,50/mês equivalente)
  // Mantemos compatível com o /admin/page existente: usa pro annual como proxy.
  annual: PLAN_PRICES_BRL.pro.annual / 12,
};

type ProfileRow = { id: string; created_at: string };
type LectureRow = { user_id: string; created_at: string };
type SubRow = {
  user_id: string;
  plan: string | null;
  status: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type MarketingStatsPayload = {
  funnel30d: {
    signups: number;
    activated: number;
    checkoutStarted: number | null; // GA4-only, server não tem — placeholder null
    paid: number;
  };
  mrrNow: number;
  mrr30dAgo: number;
  mrrTrendPct: number;
  planMix: Array<{ plan: string; count: number; mrr: number }>;
  churn30d: {
    canceled: number;
    baseStart: number;
    rate: number;
  };
  conversionRate30d: number;
  cohorts: Array<{
    weekStart: string;
    signups: number;
    converted: number;
    rate: number;
  }>;
  fetchedAt: string;
};

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function weekStart(d: Date): Date {
  // Segunda como início da semana.
  const out = new Date(d);
  out.setUTCHours(0, 0, 0, 0);
  const day = out.getUTCDay(); // 0 = dom
  const diff = (day === 0 ? -6 : 1) - day;
  out.setUTCDate(out.getUTCDate() + diff);
  return out;
}

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const admin = createAdminClient();
  const now = new Date();
  const since30d = isoDaysAgo(30);
  const since60d = isoDaysAgo(60);
  const since8w = isoDaysAgo(7 * 8);

  const [
    signups30Res,
    signups8wRes,
    activatedLecturesRes,
    activeSubsRes,
    paid30Res,
    canceled30Res,
    activeAt30AgoRes,
  ] = await Promise.all([
    admin
      .from("profiles")
      .select("id, created_at")
      .gte("created_at", since30d),
    admin
      .from("profiles")
      .select("id, created_at")
      .gte("created_at", since8w),
    // Para "activated", buscamos qualquer lecture criada nos últimos 30d e
    // filtramos em memória pelos signups do mesmo período. Mais barato que join.
    admin
      .from("lectures")
      .select("user_id, created_at")
      .gte("created_at", since30d),
    // Snapshot atual: assinaturas ativas/trialing.
    admin
      .from("subscriptions")
      .select(
        "user_id, plan, status, current_period_start, current_period_end, created_at, updated_at",
      )
      .in("status", ["active", "trialing"]),
    // Subscriptions criadas nos últimos 30d que viraram paid.
    admin
      .from("subscriptions")
      .select("user_id, plan, status, created_at")
      .in("status", ["active", "trialing"])
      .gte("created_at", since30d),
    // Churn 30d: status=canceled com updated_at recente.
    admin
      .from("subscriptions")
      .select("user_id, plan, status, updated_at")
      .eq("status", "canceled")
      .gte("updated_at", since30d),
    // Base inicial: assinaturas criadas antes de 30d atrás (proxy de "ativos no início").
    admin
      .from("subscriptions")
      .select("user_id")
      .in("status", ["active", "trialing", "canceled"])
      .lte("created_at", since30d)
      .gte("created_at", since60d),
  ]);

  const signups30 =
    (signups30Res.data as Array<ProfileRow> | null) ?? [];
  const signups8w =
    (signups8wRes.data as Array<ProfileRow> | null) ?? [];
  const lectures30 =
    (activatedLecturesRes.data as Array<LectureRow> | null) ?? [];
  const activeSubs = (activeSubsRes.data as Array<SubRow> | null) ?? [];
  const paid30 = (paid30Res.data as Array<SubRow> | null) ?? [];
  const canceled30 =
    (canceled30Res.data as Array<SubRow> | null) ?? [];
  const baseStartRows =
    (activeAt30AgoRes.data as Array<{ user_id: string }> | null) ?? [];

  // Funnel
  const signupIds = new Set(signups30.map((r) => r.id));
  const activatedIds = new Set<string>();
  for (const l of lectures30) {
    if (signupIds.has(l.user_id)) activatedIds.add(l.user_id);
  }
  const paidIds = new Set<string>();
  for (const p of paid30) {
    if (signupIds.has(p.user_id)) paidIds.add(p.user_id);
  }

  // MRR agora
  let mrrNow = 0;
  const planMixMap = new Map<string, { count: number; mrr: number }>();
  for (const s of activeSubs) {
    const plan = s.plan ?? "free";
    const planMrr = PLAN_MRR_BRL[plan] ?? 0;
    mrrNow += planMrr;
    const entry = planMixMap.get(plan) ?? { count: 0, mrr: 0 };
    entry.count += 1;
    entry.mrr += planMrr;
    planMixMap.set(plan, entry);
  }

  // MRR 30d atrás: assinaturas que já existiam (created_at <= since30d) e
  // ainda não haviam sido canceladas até aquele momento (ou foram canceladas
  // depois de since30d). Como aproximação razoável: contamos ativos hoje
  // criados antes de 30d + cancelados nos últimos 30d (que eram ativos).
  let mrr30dAgo = 0;
  for (const s of activeSubs) {
    if (s.created_at && s.created_at <= since30d) {
      mrr30dAgo += PLAN_MRR_BRL[s.plan ?? "free"] ?? 0;
    }
  }
  for (const c of canceled30) {
    mrr30dAgo += PLAN_MRR_BRL[c.plan ?? "free"] ?? 0;
  }

  const mrrTrendPct =
    mrr30dAgo > 0 ? ((mrrNow - mrr30dAgo) / mrr30dAgo) * 100 : 0;

  // Churn
  const baseStart = new Set(baseStartRows.map((r) => r.user_id)).size;
  const churnRate =
    baseStart > 0 ? (canceled30.length / baseStart) * 100 : 0;

  // Conversion 30d (signups → paid)
  const conversionRate30d =
    signups30.length > 0 ? (paidIds.size / signups30.length) * 100 : 0;

  // Cohorts: 8 semanas
  // 1) Bucket signups por week
  const weekBuckets = new Map<
    string,
    { signups: Set<string>; converted: Set<string> }
  >();
  for (let i = 7; i >= 0; i--) {
    const wd = new Date(now);
    wd.setUTCDate(wd.getUTCDate() - i * 7);
    const key = weekStart(wd).toISOString().slice(0, 10);
    weekBuckets.set(key, { signups: new Set(), converted: new Set() });
  }
  for (const p of signups8w) {
    const wk = weekStart(new Date(p.created_at)).toISOString().slice(0, 10);
    const bucket = weekBuckets.get(wk);
    if (bucket) bucket.signups.add(p.id);
  }
  // Quem converteu (qualquer subscription paga, snapshot atual ativa)
  const everPaidIds = new Set<string>();
  for (const s of activeSubs) everPaidIds.add(s.user_id);
  for (const [, bucket] of weekBuckets) {
    for (const uid of bucket.signups) {
      if (everPaidIds.has(uid)) bucket.converted.add(uid);
    }
  }

  const cohorts = Array.from(weekBuckets.entries())
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([weekStartIso, b]) => ({
      weekStart: weekStartIso,
      signups: b.signups.size,
      converted: b.converted.size,
      rate: b.signups.size > 0 ? (b.converted.size / b.signups.size) * 100 : 0,
    }));

  const planMix = Array.from(planMixMap.entries())
    .map(([plan, v]) => ({
      plan,
      count: v.count,
      mrr: Number(v.mrr.toFixed(2)),
    }))
    .sort((a, b) => b.count - a.count);

  const payload: MarketingStatsPayload = {
    funnel30d: {
      signups: signups30.length,
      activated: activatedIds.size,
      checkoutStarted: null,
      paid: paidIds.size,
    },
    mrrNow: Number(mrrNow.toFixed(2)),
    mrr30dAgo: Number(mrr30dAgo.toFixed(2)),
    mrrTrendPct: Number(mrrTrendPct.toFixed(1)),
    planMix,
    churn30d: {
      canceled: canceled30.length,
      baseStart,
      rate: Number(churnRate.toFixed(2)),
    },
    conversionRate30d: Number(conversionRate30d.toFixed(2)),
    cohorts,
    fetchedAt: new Date().toISOString(),
  };

  return NextResponse.json(payload);
}
