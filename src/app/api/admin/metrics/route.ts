import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PLAN_PRICE_MONTHLY: Record<string, number> = {
  starter: 9,
  pro: 19,
  power: 49,
  annual: 149 / 12,
};

export type AdminMetricsPayload = {
  total_users: number;
  active_subscriptions: number;
  plan_breakdown: Record<string, number>;
  mrr_brl: number;
  signups_7d: number;
  signups_30d: number;
  churn_30d: number;
  active_users_7d: number;
  total_lectures: number;
  total_coins_spent_30d: number;
  signups_daily_30d: Array<{ date: string; count: number }>;
  revenue_monthly_6m: Array<{ month: string; revenue: number }>;
};

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const admin = createAdminClient();
  const now = new Date();
  const ms7d = 7 * 24 * 60 * 60 * 1000;
  const ms30d = 30 * 24 * 60 * 60 * 1000;
  const iso7 = new Date(now.getTime() - ms7d).toISOString();
  const iso30 = new Date(now.getTime() - ms30d).toISOString();

  const [
    profilesCount,
    activeSubs,
    allSubs,
    lecturesCount,
    signups7,
    signups30,
    churnRows,
    coinsSpent30,
    profilesLast30,
  ] = await Promise.all([
    admin.from("profiles").select("*", { count: "exact", head: true }),
    admin
      .from("subscriptions")
      .select("*", { count: "exact", head: true })
      .eq("status", "active"),
    admin
      .from("subscriptions")
      .select("plan, status")
      .in("status", ["active", "trialing"]),
    admin.from("lectures").select("*", { count: "exact", head: true }),
    admin
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .gte("created_at", iso7),
    admin
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .gte("created_at", iso30),
    admin
      .from("subscriptions")
      .select("*", { count: "exact", head: true })
      .eq("status", "canceled")
      .gte("updated_at", iso30),
    admin
      .from("coin_transactions")
      .select("amount")
      .lt("amount", 0)
      .gte("created_at", iso30),
    admin
      .from("profiles")
      .select("created_at")
      .gte("created_at", iso30)
      .order("created_at", { ascending: true }),
  ]);

  const planBreakdown: Record<string, number> = {};
  let mrr = 0;
  for (const row of ((allSubs.data as Array<{ plan: string }> | null) ?? [])) {
    const plan = row.plan ?? "free";
    planBreakdown[plan] = (planBreakdown[plan] ?? 0) + 1;
    mrr += PLAN_PRICE_MONTHLY[plan] ?? 0;
  }

  const totalCoinsSpent = (
    (coinsSpent30.data as Array<{ amount: number }> | null) ?? []
  ).reduce((acc, r) => acc + Math.abs(r.amount), 0);

  // Active users 7d: usa lectures.updated_at OR coin_transactions.created_at como proxy
  const { data: activeFromLectures } = await admin
    .from("lectures")
    .select("user_id")
    .gte("updated_at", iso7);
  const activeIds = new Set<string>();
  for (const row of (activeFromLectures as Array<{ user_id: string }> | null) ??
    []) {
    activeIds.add(row.user_id);
  }
  const { data: activeFromCoins } = await admin
    .from("coin_transactions")
    .select("user_id")
    .gte("created_at", iso7);
  for (const row of (activeFromCoins as Array<{ user_id: string }> | null) ??
    []) {
    activeIds.add(row.user_id);
  }

  // Signups daily 30d
  const signupsDailyMap = new Map<string, number>();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const key = d.toISOString().slice(0, 10);
    signupsDailyMap.set(key, 0);
  }
  for (const row of (profilesLast30.data as Array<{ created_at: string }> | null) ??
    []) {
    const key = row.created_at.slice(0, 10);
    if (signupsDailyMap.has(key)) {
      signupsDailyMap.set(key, (signupsDailyMap.get(key) ?? 0) + 1);
    }
  }
  const signupsDaily = Array.from(signupsDailyMap.entries()).map(
    ([date, count]) => ({ date, count }),
  );

  // Revenue monthly 6m (estimate: planos ativos no mês × price)
  const revenue6m: Array<{ month: string; revenue: number }> = [];
  for (let i = 5; i >= 0; i--) {
    const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    const { data: monthSubs } = await admin
      .from("subscriptions")
      .select("plan")
      .in("status", ["active", "trialing"])
      .lte("created_at", monthEnd.toISOString())
      .or(
        `current_period_end.is.null,current_period_end.gte.${monthStart.toISOString()}`,
      );
    let revenue = 0;
    for (const row of (monthSubs as Array<{ plan: string }> | null) ?? []) {
      revenue += PLAN_PRICE_MONTHLY[row.plan ?? "free"] ?? 0;
    }
    revenue6m.push({
      month: monthStart.toISOString().slice(0, 7),
      revenue: Math.round(revenue * 100) / 100,
    });
  }

  const payload: AdminMetricsPayload = {
    total_users: profilesCount.count ?? 0,
    active_subscriptions: activeSubs.count ?? 0,
    plan_breakdown: planBreakdown,
    mrr_brl: Math.round(mrr * 100) / 100,
    signups_7d: signups7.count ?? 0,
    signups_30d: signups30.count ?? 0,
    churn_30d: churnRows.count ?? 0,
    active_users_7d: activeIds.size,
    total_lectures: lecturesCount.count ?? 0,
    total_coins_spent_30d: totalCoinsSpent,
    signups_daily_30d: signupsDaily,
    revenue_monthly_6m: revenue6m,
  };

  return NextResponse.json(payload);
}
