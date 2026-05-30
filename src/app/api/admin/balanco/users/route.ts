/**
 * GET /api/admin/balanco/users
 *
 * Lista de users com snapshot financeiro 30d:
 * - coin_balance atual
 * - coins_spent_30d (sum |amount| onde amount<0)
 * - cost_usd_30d (ai_usage_log)
 * - cost_brl_30d (× USD_BRL)
 * - revenue_brl_month (subscription ativa, normalizada)
 * - margin_brl_30d (revenue - cost)
 * - margin_pct
 *
 * Query params:
 *   ?sort=margin|cost|coins  (default: cost desc)
 *   ?plan=free|starter|pro|power
 *   ?status=active|trialing|canceled|all  (default: all)
 *   ?at_risk=1  (filtra só users com margem negativa)
 *   ?q=email   (busca)
 *   ?limit=50  (max 200)
 */

import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const USD_BRL = 5.5;

export type BalancoUserRow = {
  user_id: string;
  email: string;
  name: string | null;
  plan: string;
  status: string;
  billing_interval: string | null;
  coin_balance: number;
  coins_spent_30d: number;
  cost_usd_30d: number;
  cost_brl_30d: number;
  revenue_brl_month: number;
  margin_brl_30d: number;
  margin_pct: number;
  at_risk: boolean;
  last_activity_at: string | null;
};

type ProfileWithSubs = {
  id: string;
  email: string;
  name: string | null;
  coin_balance: number | null;
  subscriptions: Array<{
    plan: string | null;
    status: string | null;
    amount_cents: number | null;
    billing_interval: string | null;
  }> | null;
};

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const sort = url.searchParams.get("sort") ?? "cost"; // cost|margin|coins
  const planFilter = url.searchParams.get("plan");
  const statusFilter = url.searchParams.get("status") ?? "all";
  const atRiskOnly = url.searchParams.get("at_risk") === "1";
  const q = url.searchParams.get("q")?.trim();
  const limit = Math.min(
    Math.max(parseInt(url.searchParams.get("limit") ?? "100", 10) || 100, 10),
    200,
  );

  const supabase = createAdminClient();

  const now = new Date();
  const since30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // 1. Profiles + subscriptions
  let query = supabase
    .from("profiles")
    .select(
      "id, email, name, coin_balance, subscriptions(plan, status, amount_cents, billing_interval)",
    )
    .order("coin_balance", { ascending: false })
    .limit(500); // pega bastante, filtra/ordena depois client-side

  if (q) {
    query = query.ilike("email", `%${q}%`);
  }

  const { data: profiles, error: profilesErr } = await query;
  if (profilesErr) {
    return NextResponse.json({ error: profilesErr.message }, { status: 500 });
  }

  const profileRows = (profiles ?? []) as ProfileWithSubs[];
  const userIds = profileRows.map((p) => p.id);

  if (userIds.length === 0) {
    return NextResponse.json({ users: [], total: 0 });
  }

  // 2. Custos 30d agregados por user
  const { data: costRows } = await supabase
    .from("ai_usage_log")
    .select("user_id, cost_usd, created_at")
    .gte("created_at", since30d)
    .in("user_id", userIds);

  const costByUser = new Map<string, number>();
  const lastActivityByUser = new Map<string, string>();
  for (const row of (costRows ?? []) as Array<{
    user_id: string | null;
    cost_usd: number;
    created_at: string;
  }>) {
    if (!row.user_id) continue;
    costByUser.set(
      row.user_id,
      (costByUser.get(row.user_id) ?? 0) + (Number(row.cost_usd) || 0),
    );
    const prev = lastActivityByUser.get(row.user_id);
    if (!prev || row.created_at > prev) {
      lastActivityByUser.set(row.user_id, row.created_at);
    }
  }

  // 3. Coins gastos 30d por user (sum |amount| onde amount<0)
  const { data: txRows } = await supabase
    .from("coin_transactions")
    .select("user_id, amount")
    .lt("amount", 0)
    .gte("created_at", since30d)
    .in("user_id", userIds);

  const coinsSpentByUser = new Map<string, number>();
  for (const row of (txRows ?? []) as Array<{
    user_id: string;
    amount: number;
  }>) {
    coinsSpentByUser.set(
      row.user_id,
      (coinsSpentByUser.get(row.user_id) ?? 0) + Math.abs(row.amount),
    );
  }

  // 4. Compõe rows
  const rows: BalancoUserRow[] = profileRows.map((p) => {
    const sub = p.subscriptions?.[0];
    const plan = sub?.plan ?? "free";
    const status = sub?.status ?? "free";
    const monthlyCents =
      sub?.billing_interval === "year"
        ? Math.round((sub?.amount_cents ?? 0) / 12)
        : sub?.amount_cents ?? 0;
    const revenue = monthlyCents / 100;
    const costUsd = costByUser.get(p.id) ?? 0;
    const costBrl = costUsd * USD_BRL;
    const margin = revenue - costBrl;
    return {
      user_id: p.id,
      email: p.email,
      name: p.name,
      plan,
      status,
      billing_interval: sub?.billing_interval ?? null,
      coin_balance: p.coin_balance ?? 0,
      coins_spent_30d: coinsSpentByUser.get(p.id) ?? 0,
      cost_usd_30d: round(costUsd, 4),
      cost_brl_30d: round(costBrl),
      revenue_brl_month: round(revenue),
      margin_brl_30d: round(margin),
      margin_pct: revenue > 0 ? round((margin / revenue) * 100) : 0,
      at_risk: costBrl > revenue && costBrl > 0.5,
      last_activity_at: lastActivityByUser.get(p.id) ?? null,
    };
  });

  // 5. Filtros pós-fetch
  let filtered = rows;
  if (planFilter && planFilter !== "all") {
    filtered = filtered.filter((r) => r.plan === planFilter);
  }
  if (statusFilter && statusFilter !== "all") {
    filtered = filtered.filter((r) => r.status === statusFilter);
  }
  if (atRiskOnly) {
    filtered = filtered.filter((r) => r.at_risk);
  }

  // 6. Sort
  if (sort === "margin") {
    filtered.sort((a, b) => a.margin_brl_30d - b.margin_brl_30d); // mais negativo primeiro
  } else if (sort === "coins") {
    filtered.sort((a, b) => b.coins_spent_30d - a.coins_spent_30d);
  } else {
    // default: cost
    filtered.sort((a, b) => b.cost_brl_30d - a.cost_brl_30d);
  }

  return NextResponse.json({
    users: filtered.slice(0, limit),
    total: filtered.length,
    usd_brl_rate: USD_BRL,
  });
}

function round(n: number, decimals = 2): number {
  const f = Math.pow(10, decimals);
  return Math.round(n * f) / f;
}
