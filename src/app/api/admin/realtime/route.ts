import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type UsageRow = {
  id: string;
  user_id: string | null;
  endpoint: string;
  model: string;
  input_tokens: number | null;
  output_tokens: number | null;
  cost_usd: string | number;
  created_at: string;
};

type ProfileLite = {
  id: string;
  email: string;
  name: string | null;
};

export type RealtimeKpis = {
  calls_5m: number;
  calls_5m_prev: number;
  cost_usd_1h: number;
  tokens_per_second: number;
  active_users_10m: number;
};

export type RealtimeChartPoint = {
  minute: string;
  cost_usd: number;
};

export type RealtimeCall = {
  id: string;
  user_id: string | null;
  user_email: string | null;
  user_name: string | null;
  endpoint: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  created_at: string;
};

export type RealtimePayload = {
  server_time: string;
  kpis: RealtimeKpis;
  chart: RealtimeChartPoint[];
  recent_calls: RealtimeCall[];
};

export async function GET(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const url = new URL(req.url);
  const sinceParam = url.searchParams.get("since");

  const admin = createAdminClient();
  const now = new Date();
  const now5m = new Date(now.getTime() - 5 * 60 * 1000);
  const now10m = new Date(now.getTime() - 10 * 60 * 1000);
  const now60m = new Date(now.getTime() - 60 * 60 * 1000);
  const prev5m = new Date(now.getTime() - 10 * 60 * 1000);

  const since = sinceParam ? new Date(sinceParam) : now60m;
  const sinceIso = isNaN(since.getTime()) ? now60m.toISOString() : since.toISOString();

  const [recent60m, calls5mCount, callsPrev5mCount, recentCallsRes] = await Promise.all([
    admin
      .from("ai_usage_log")
      .select("user_id, input_tokens, output_tokens, cost_usd, created_at")
      .gte("created_at", now60m.toISOString())
      .order("created_at", { ascending: true }),
    admin
      .from("ai_usage_log")
      .select("*", { count: "exact", head: true })
      .gte("created_at", now5m.toISOString()),
    admin
      .from("ai_usage_log")
      .select("*", { count: "exact", head: true })
      .gte("created_at", prev5m.toISOString())
      .lt("created_at", now5m.toISOString()),
    admin
      .from("ai_usage_log")
      .select("id, user_id, endpoint, model, input_tokens, output_tokens, cost_usd, created_at")
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const last60 = (recent60m.data as Array<Pick<UsageRow, "user_id" | "input_tokens" | "output_tokens" | "cost_usd" | "created_at">> | null) ?? [];

  let costUsd1h = 0;
  let tokensTotal60s = 0;
  const activeUsers10m = new Set<string>();
  for (const r of last60) {
    costUsd1h += Number(r.cost_usd ?? 0);
    const t = new Date(r.created_at).getTime();
    if (t >= now10m.getTime() && r.user_id) {
      activeUsers10m.add(r.user_id);
    }
    if (t >= now.getTime() - 60_000) {
      tokensTotal60s += Number(r.input_tokens ?? 0) + Number(r.output_tokens ?? 0);
    }
  }

  const chartMap = new Map<string, number>();
  for (let i = 59; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 60_000);
    chartMap.set(minuteKey(d), 0);
  }
  for (const r of last60) {
    const key = minuteKey(new Date(r.created_at));
    if (chartMap.has(key)) {
      chartMap.set(key, (chartMap.get(key) ?? 0) + Number(r.cost_usd ?? 0));
    }
  }
  const chart: RealtimeChartPoint[] = Array.from(chartMap.entries()).map(([minute, cost_usd]) => ({
    minute,
    cost_usd: Math.round(cost_usd * 1_000_000) / 1_000_000,
  }));

  const callRows = (recentCallsRes.data as UsageRow[] | null) ?? [];
  const userIds = Array.from(
    new Set(callRows.map((r) => r.user_id).filter((v): v is string => !!v)),
  );

  const profileMap = new Map<string, ProfileLite>();
  if (userIds.length > 0) {
    const { data: profs } = await admin
      .from("profiles")
      .select("id, email, name")
      .in("id", userIds);
    for (const p of (profs as ProfileLite[] | null) ?? []) {
      profileMap.set(p.id, p);
    }
  }

  const recent_calls: RealtimeCall[] = callRows.map((r) => {
    const p = r.user_id ? profileMap.get(r.user_id) ?? null : null;
    return {
      id: r.id,
      user_id: r.user_id,
      user_email: p?.email ?? null,
      user_name: p?.name ?? null,
      endpoint: r.endpoint,
      model: r.model,
      input_tokens: Number(r.input_tokens ?? 0),
      output_tokens: Number(r.output_tokens ?? 0),
      cost_usd: Number(r.cost_usd ?? 0),
      created_at: r.created_at,
    };
  });

  const payload: RealtimePayload = {
    server_time: now.toISOString(),
    kpis: {
      calls_5m: calls5mCount.count ?? 0,
      calls_5m_prev: callsPrev5mCount.count ?? 0,
      cost_usd_1h: Math.round(costUsd1h * 1_000_000) / 1_000_000,
      tokens_per_second: Math.round((tokensTotal60s / 60) * 100) / 100,
      active_users_10m: activeUsers10m.size,
    },
    chart,
    recent_calls,
  };

  return NextResponse.json(payload);
}

function minuteKey(d: Date): string {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mi = String(d.getUTCMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}:00Z`;
}
