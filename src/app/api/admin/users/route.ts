import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type AdminUserRow = {
  id: string;
  email: string;
  name: string | null;
  role: "user" | "admin";
  onboarded_at: string | null;
  created_at: string;
  coin_balance: number;
  banned_until: string | null;
  last_sign_in_at: string | null;
  plan: string;
  subscription_status: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  lectures_count: number;
};

type ProfileWithSubs = {
  id: string;
  email: string;
  name: string | null;
  role: "user" | "admin";
  onboarded_at: string | null;
  created_at: string;
  coin_balance: number | null;
  subscriptions: Array<{
    plan: string | null;
    status: string | null;
    current_period_end: string | null;
    cancel_at_period_end: boolean | null;
  }> | null;
};

export async function GET(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const url = new URL(req.url);
  const search = url.searchParams.get("q")?.trim() ?? "";
  const planFilter = url.searchParams.get("plan");
  const statusFilter = url.searchParams.get("status"); // active | banned | all
  const limit = Math.min(
    Math.max(parseInt(url.searchParams.get("limit") ?? "100", 10) || 100, 1),
    500,
  );

  const admin = createAdminClient();

  let query = admin
    .from("profiles")
    .select(
      "id, email, name, role, onboarded_at, created_at, coin_balance, subscriptions(plan, status, current_period_end, cancel_at_period_end)",
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (search) {
    const term = `%${search}%`;
    query = query.or(`email.ilike.${term},name.ilike.${term}`);
  }

  const { data: profiles, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const profileRows = (profiles ?? []) as ProfileWithSubs[];

  // Pega banned_until + last_sign_in_at do auth admin (em paralelo)
  // Pega lecture counts em paralelo
  const ids = profileRows.map((p) => p.id);

  // Lectures count agrupado
  const lectureCounts = new Map<string, number>();
  if (ids.length > 0) {
    const { data: lectureRows } = await admin
      .from("lectures")
      .select("user_id")
      .in("user_id", ids);
    for (const row of (lectureRows ?? []) as Array<{ user_id: string }>) {
      lectureCounts.set(row.user_id, (lectureCounts.get(row.user_id) ?? 0) + 1);
    }
  }

  // Auth admin: pega banned_until e last_sign_in_at via listUsers
  // Como listUsers pode ser caro, fazemos por chunk de até 200 (default da API).
  const authMap = new Map<
    string,
    { banned_until: string | null; last_sign_in_at: string | null }
  >();
  try {
    const { data: authData } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });
    const list =
      (authData as { users?: Array<Record<string, unknown>> } | null)?.users ??
      [];
    for (const u of list) {
      const id = u.id as string;
      const bannedUntil =
        (u.banned_until as string | null) ??
        ((u as { ban_duration?: string | null }).ban_duration ?? null);
      const lastSignIn = (u.last_sign_in_at as string | null) ?? null;
      authMap.set(id, {
        banned_until: bannedUntil,
        last_sign_in_at: lastSignIn,
      });
    }
  } catch (err) {
    console.error("[admin/users] listUsers failed", err);
  }

  const enriched: AdminUserRow[] = profileRows.map((p) => {
    const sub = p.subscriptions?.[0];
    const auth = authMap.get(p.id);
    const now = Date.now();
    const bannedUntil = auth?.banned_until ?? null;
    const isBanned =
      !!bannedUntil && new Date(bannedUntil).getTime() > now;
    return {
      id: p.id,
      email: p.email,
      name: p.name,
      role: p.role,
      onboarded_at: p.onboarded_at,
      created_at: p.created_at,
      coin_balance: p.coin_balance ?? 0,
      banned_until: isBanned ? bannedUntil : null,
      last_sign_in_at: auth?.last_sign_in_at ?? null,
      plan: sub?.plan ?? "free",
      subscription_status: sub?.status ?? "inactive",
      current_period_end: sub?.current_period_end ?? null,
      cancel_at_period_end: sub?.cancel_at_period_end ?? false,
      lectures_count: lectureCounts.get(p.id) ?? 0,
    };
  });

  // Filtros de plan/status pós-fetch (mais simples que mexer na query)
  let filtered = enriched;
  if (planFilter && planFilter !== "all") {
    filtered = filtered.filter((u) => u.plan === planFilter);
  }
  if (statusFilter === "banned") {
    filtered = filtered.filter((u) => !!u.banned_until);
  } else if (statusFilter === "active") {
    filtered = filtered.filter((u) => !u.banned_until);
  }

  return NextResponse.json({ users: filtered, total: filtered.length });
}
