/**
 * GET /api/admin/balanco/aggregate
 *
 * Snapshot agregado pro painel /admin/balanco:
 * - MRR total BRL (subscriptions ativas, anual normalizado / 12)
 * - Custo total API 30d (sum ai_usage_log.cost_usd × USD_BRL)
 * - Margem absoluta + percentual
 * - Breakdown por plano: receita, users ativos, custo médio, margem média
 * - Count de users com prejuízo (custo 30d > receita 30d normalizada)
 *
 * USD_BRL hardcoded em 5.50 (atualizar se câmbio mudar significativamente).
 */

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const USD_BRL = 5.5;

type PlanName = "free" | "starter" | "pro" | "power" | "annual" | "trialing";

type SubRow = {
  user_id: string;
  plan: string | null;
  status: string | null;
  amount_cents: number | null;
  billing_interval: string | null;
};

type CostRow = {
  user_id: string | null;
  cost_usd: number;
};

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const supabase = createAdminClient();

  const now = new Date();
  const since30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // 1. Subscriptions ativas
  const { data: subs, error: subsErr } = await supabase
    .from("subscriptions")
    .select("user_id, plan, status, amount_cents, billing_interval");

  if (subsErr) {
    return NextResponse.json({ error: subsErr.message }, { status: 500 });
  }

  const allSubs = (subs ?? []) as SubRow[];
  const activeSubs = allSubs.filter(
    (s) => s.status === "active" || s.status === "trialing",
  );

  // 2. Custos API 30d agrupados por user
  const { data: costs, error: costsErr } = await supabase
    .from("ai_usage_log")
    .select("user_id, cost_usd")
    .gte("created_at", since30d);

  if (costsErr) {
    return NextResponse.json({ error: costsErr.message }, { status: 500 });
  }

  const costByUser = new Map<string, number>();
  let totalCostUsd = 0;
  for (const row of (costs ?? []) as CostRow[]) {
    const c = Number(row.cost_usd) || 0;
    totalCostUsd += c;
    if (row.user_id) {
      costByUser.set(row.user_id, (costByUser.get(row.user_id) ?? 0) + c);
    }
  }

  // 3. MRR total (anual normaliza ÷ 12)
  let mrrCents = 0;
  for (const s of activeSubs) {
    const amount = s.amount_cents ?? 0;
    if (s.billing_interval === "year") {
      mrrCents += Math.round(amount / 12);
    } else {
      mrrCents += amount;
    }
  }
  const mrrBrl = mrrCents / 100;
  const totalCostBrl = totalCostUsd * USD_BRL;
  const marginBrl = mrrBrl - totalCostBrl;
  const marginPct = mrrBrl > 0 ? (marginBrl / mrrBrl) * 100 : 0;

  // 4. Breakdown por plano
  type PlanAgg = {
    plan: PlanName;
    users: number;
    mrr_brl: number;
    avg_cost_brl_per_user: number;
    avg_margin_brl_per_user: number;
    avg_margin_pct: number;
  };

  const planMap = new Map<string, {
    users: number;
    mrr_cents: number;
    cost_brl_sum: number;
  }>();

  for (const s of activeSubs) {
    const plan = s.plan || "free";
    const cur = planMap.get(plan) ?? { users: 0, mrr_cents: 0, cost_brl_sum: 0 };
    cur.users += 1;
    const monthlyCents =
      s.billing_interval === "year"
        ? Math.round((s.amount_cents ?? 0) / 12)
        : s.amount_cents ?? 0;
    cur.mrr_cents += monthlyCents;
    const userCostUsd = costByUser.get(s.user_id) ?? 0;
    cur.cost_brl_sum += userCostUsd * USD_BRL;
    planMap.set(plan, cur);
  }

  const planBreakdown: PlanAgg[] = Array.from(planMap.entries()).map(
    ([plan, v]) => {
      const mrr = v.mrr_cents / 100;
      const avgCost = v.users > 0 ? v.cost_brl_sum / v.users : 0;
      const avgMrr = v.users > 0 ? mrr / v.users : 0;
      const avgMargin = avgMrr - avgCost;
      return {
        plan: plan as PlanName,
        users: v.users,
        mrr_brl: round(mrr),
        avg_cost_brl_per_user: round(avgCost),
        avg_margin_brl_per_user: round(avgMargin),
        avg_margin_pct: avgMrr > 0 ? round((avgMargin / avgMrr) * 100) : 0,
      };
    },
  );

  // 5. Users com prejuízo (cost > receita mensal)
  // Para calcular: pega cada user com custo > 0, compara com sua receita mensal
  const usersAtRisk: Array<{
    user_id: string;
    cost_brl: number;
    revenue_brl: number;
    margin_brl: number;
  }> = [];

  const subByUser = new Map<string, SubRow>();
  for (const s of activeSubs) subByUser.set(s.user_id, s);

  for (const [userId, costUsd] of costByUser.entries()) {
    const sub = subByUser.get(userId);
    const monthlyCents = sub
      ? sub.billing_interval === "year"
        ? Math.round((sub.amount_cents ?? 0) / 12)
        : sub.amount_cents ?? 0
      : 0;
    const revenue = monthlyCents / 100;
    const cost = costUsd * USD_BRL;
    if (cost > revenue && cost > 0.5) {
      usersAtRisk.push({
        user_id: userId,
        cost_brl: round(cost),
        revenue_brl: round(revenue),
        margin_brl: round(revenue - cost),
      });
    }
  }
  usersAtRisk.sort((a, b) => a.margin_brl - b.margin_brl); // mais negativo primeiro

  return NextResponse.json({
    snapshot: {
      mrr_brl: round(mrrBrl),
      cost_usd_30d: round(totalCostUsd, 4),
      cost_brl_30d: round(totalCostBrl),
      margin_brl_30d: round(marginBrl),
      margin_pct_30d: round(marginPct),
      active_subscriptions: activeSubs.length,
      total_subscriptions: allSubs.length,
      usd_brl_rate: USD_BRL,
      users_at_risk_count: usersAtRisk.length,
    },
    plan_breakdown: planBreakdown.sort((a, b) => b.mrr_brl - a.mrr_brl),
    users_at_risk: usersAtRisk.slice(0, 10), // top 10
  });
}

function round(n: number, decimals = 2): number {
  const f = Math.pow(10, decimals);
  return Math.round(n * f) / f;
}
