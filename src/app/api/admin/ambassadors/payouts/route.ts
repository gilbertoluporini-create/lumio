import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type PayoutRow = {
  id: string;
  ambassador_user_id: string;
  ambassador_email: string;
  ambassador_name: string | null;
  coupon_code: string | null;
  pix_key: string;
  period_start: string;
  period_end: string;
  gross_revenue_brl: number;
  commission_rate: number;
  commission_brl: number;
  status: "pending" | "paid" | "failed" | "cancelled";
  pix_paid_at: string | null;
  pix_transaction_id: string | null;
  notes: string | null;
  created_at: string;
};

/**
 * GET /api/admin/ambassadors/payouts?status=pending|paid|all&month=YYYY-MM
 *
 * Lista payouts mensais consolidados. Default: pending do mês corrente.
 */
export async function GET(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const url = new URL(req.url);
  const statusFilter = url.searchParams.get("status") ?? "all";
  const monthParam = url.searchParams.get("month"); // YYYY-MM, default = todos meses

  const admin = createAdminClient();

  let query = admin
    .from("ambassador_payouts")
    .select(
      "id, ambassador_user_id, pix_key, period_start, period_end, gross_revenue_brl, commission_rate, commission_brl, status, pix_paid_at, pix_transaction_id, notes, created_at, referral_code_id",
    )
    .order("period_start", { ascending: false })
    .order("commission_brl", { ascending: false });

  if (statusFilter !== "all") {
    query = query.eq("status", statusFilter);
  }
  if (monthParam) {
    const [y, m] = monthParam.split("-").map(Number);
    if (y && m) {
      const start = new Date(Date.UTC(y, m - 1, 1)).toISOString().slice(0, 10);
      const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
      query = query.gte("period_start", start).lte("period_start", end);
    }
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const payouts = (data ?? []) as Array<
    Omit<PayoutRow, "ambassador_email" | "ambassador_name" | "coupon_code"> & {
      referral_code_id: string;
    }
  >;

  if (payouts.length === 0) {
    return NextResponse.json({ payouts: [], totals: zeroTotals() });
  }

  // Hidrata: profile (email/name) + coupon_code do referral_codes
  const userIds = [...new Set(payouts.map((p) => p.ambassador_user_id))];
  const codeIds = [...new Set(payouts.map((p) => p.referral_code_id))];

  const [{ data: profiles }, { data: codes }] = await Promise.all([
    admin.from("profiles").select("id, email, name").in("id", userIds),
    admin
      .from("referral_codes")
      .select("id, coupon_code")
      .in("id", codeIds),
  ]);

  const profileMap = new Map<string, { email: string; name: string | null }>();
  for (const p of (profiles ?? []) as Array<{
    id: string;
    email: string;
    name: string | null;
  }>) {
    profileMap.set(p.id, { email: p.email, name: p.name });
  }
  const codeMap = new Map<string, string | null>();
  for (const c of (codes ?? []) as Array<{ id: string; coupon_code: string | null }>) {
    codeMap.set(c.id, c.coupon_code);
  }

  const enriched: PayoutRow[] = payouts.map((p) => {
    const prof = profileMap.get(p.ambassador_user_id);
    return {
      id: p.id,
      ambassador_user_id: p.ambassador_user_id,
      ambassador_email: prof?.email ?? "(user removido)",
      ambassador_name: prof?.name ?? null,
      coupon_code: codeMap.get(p.referral_code_id) ?? null,
      pix_key: p.pix_key,
      period_start: p.period_start,
      period_end: p.period_end,
      gross_revenue_brl: Number(p.gross_revenue_brl),
      commission_rate: Number(p.commission_rate),
      commission_brl: Number(p.commission_brl),
      status: p.status,
      pix_paid_at: p.pix_paid_at,
      pix_transaction_id: p.pix_transaction_id,
      notes: p.notes,
      created_at: p.created_at,
    };
  });

  const totals = {
    count: enriched.length,
    pending_count: enriched.filter((p) => p.status === "pending").length,
    paid_count: enriched.filter((p) => p.status === "paid").length,
    pending_brl: round(
      enriched
        .filter((p) => p.status === "pending")
        .reduce((acc, p) => acc + p.commission_brl, 0),
    ),
    paid_brl: round(
      enriched
        .filter((p) => p.status === "paid")
        .reduce((acc, p) => acc + p.commission_brl, 0),
    ),
    gross_brl: round(
      enriched.reduce((acc, p) => acc + p.gross_revenue_brl, 0),
    ),
  };

  return NextResponse.json({ payouts: enriched, totals });
}

function zeroTotals() {
  return {
    count: 0,
    pending_count: 0,
    paid_count: 0,
    pending_brl: 0,
    paid_brl: 0,
    gross_brl: 0,
  };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
