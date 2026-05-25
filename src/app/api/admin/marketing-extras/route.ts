/**
 * GET /api/admin/marketing-extras
 *
 * Métricas paralelas ao /api/admin/marketing-stats focadas em programa
 * de embaixadores, lead magnet e compras recentes (validação ao vivo).
 * Apenas admin.
 */

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ReferralCodeRow = {
  id: string;
  user_id: string;
  code: string;
  total_clicks: number;
  total_signups: number;
  total_paid: number;
  total_reward_brl: number;
  created_at: string;
};

type ReferralRedemptionRow = {
  id: string;
  referrer_user_id: string;
  referred_user_id: string;
  status: string;
  plan: string | null;
  signed_up_at: string;
  paid_at: string | null;
  reward_brl: number | null;
};

type LeadRow = {
  id: string;
  email: string;
  source: string | null;
  status: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

type StripeEventRow = {
  id: string;
  type: string;
  payload: unknown;
  processed_at: string | null;
  created_at: string;
};

type ProfileLookup = { id: string; email: string; name: string | null };

export type MarketingExtrasPayload = {
  referrals: {
    totalCodes: number;
    totalClicks: number;
    totalSignups: number;
    totalPaid: number;
    totalRewardBrl: number;
    topAmbassadors: Array<{
      code: string;
      email: string | null;
      clicks: number;
      signups: number;
      paid: number;
      rewardBrl: number;
    }>;
    recentRedemptions: Array<{
      id: string;
      referrerEmail: string | null;
      referredEmail: string | null;
      status: string;
      plan: string | null;
      signedUpAt: string;
      paidAt: string | null;
      rewardBrl: number;
    }>;
  };
  leadMagnet: {
    totalLeads: number;
    bonusCredited: number;
    bonusPending: number;
    last7d: number;
    recentLeads: Array<{
      email: string;
      createdAt: string;
      bonusCredited: boolean;
      bonusPending: boolean;
    }>;
  };
  recentPurchases: Array<{
    eventId: string;
    type: string;
    plan: string | null;
    amountBrl: number | null;
    userEmail: string | null;
    receivedAt: string;
    processedAt: string | null;
    sessionId: string | null;
    fromReferral: boolean;
  }>;
  fetchedAt: string;
};

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const admin = createAdminClient();
  const since24h = isoDaysAgo(1);
  const since7d = isoDaysAgo(7);

  const [codesRes, redemptionsRes, leadsRes, leads7dRes, eventsRes] =
    await Promise.all([
      admin
        .from("referral_codes")
        .select(
          "id, user_id, code, total_clicks, total_signups, total_paid, total_reward_brl, created_at",
        )
        .order("total_paid", { ascending: false })
        .limit(50),
      admin
        .from("referral_redemptions")
        .select(
          "id, referrer_user_id, referred_user_id, status, plan, signed_up_at, paid_at, reward_brl",
        )
        .order("signed_up_at", { ascending: false })
        .limit(20),
      admin
        .from("leads")
        .select("id, email, source, status, metadata, created_at")
        .eq("source", "guia-revisao")
        .order("created_at", { ascending: false })
        .limit(200),
      admin
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("source", "guia-revisao")
        .gte("created_at", since7d),
      admin
        .from("stripe_events")
        .select("id, type, payload, processed_at, created_at")
        .gte("created_at", since24h)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

  const codes = (codesRes.data as ReferralCodeRow[] | null) ?? [];
  const redemptions =
    (redemptionsRes.data as ReferralRedemptionRow[] | null) ?? [];
  const leads = (leadsRes.data as LeadRow[] | null) ?? [];
  const events = (eventsRes.data as StripeEventRow[] | null) ?? [];

  // Resolver emails de TODOS user_ids envolvidos numa só query
  const userIds = new Set<string>();
  codes.forEach((c) => userIds.add(c.user_id));
  redemptions.forEach((r) => {
    userIds.add(r.referrer_user_id);
    userIds.add(r.referred_user_id);
  });

  const profileMap = new Map<string, ProfileLookup>();
  if (userIds.size > 0) {
    const { data: profiles } = await admin
      .from("profiles")
      .select("id, email, name")
      .in("id", Array.from(userIds));
    (profiles as ProfileLookup[] | null)?.forEach((p) => {
      profileMap.set(p.id, p);
    });
  }

  // ----- REFERRALS -----
  const totals = codes.reduce(
    (acc, c) => {
      acc.clicks += c.total_clicks;
      acc.signups += c.total_signups;
      acc.paid += c.total_paid;
      acc.rewardBrl += Number(c.total_reward_brl);
      return acc;
    },
    { clicks: 0, signups: 0, paid: 0, rewardBrl: 0 },
  );

  const topAmbassadors = codes
    .filter((c) => c.total_clicks > 0 || c.total_signups > 0)
    .slice(0, 10)
    .map((c) => ({
      code: c.code,
      email: profileMap.get(c.user_id)?.email ?? null,
      clicks: c.total_clicks,
      signups: c.total_signups,
      paid: c.total_paid,
      rewardBrl: Number(c.total_reward_brl),
    }));

  const recentRedemptions = redemptions.slice(0, 10).map((r) => ({
    id: r.id,
    referrerEmail: profileMap.get(r.referrer_user_id)?.email ?? null,
    referredEmail: profileMap.get(r.referred_user_id)?.email ?? null,
    status: r.status,
    plan: r.plan,
    signedUpAt: r.signed_up_at,
    paidAt: r.paid_at,
    rewardBrl: Number(r.reward_brl ?? 0),
  }));

  // Set de referred_user_ids pra cruzar com purchases recentes
  const referredIds = new Set(redemptions.map((r) => r.referred_user_id));

  // ----- LEAD MAGNET -----
  let bonusCredited = 0;
  let bonusPending = 0;
  for (const l of leads) {
    const meta = (l.metadata ?? {}) as Record<string, unknown>;
    if (meta.bonus_credited === true) bonusCredited += 1;
    else if (meta.bonus_pending === true) bonusPending += 1;
  }
  const recentLeads = leads.slice(0, 10).map((l) => {
    const meta = (l.metadata ?? {}) as Record<string, unknown>;
    return {
      email: l.email,
      createdAt: l.created_at,
      bonusCredited: meta.bonus_credited === true,
      bonusPending: meta.bonus_pending === true,
    };
  });

  // ----- RECENT PURCHASES (stripe_events 24h) -----
  // Resolve emails dos user_ids vindos do payload.client_reference_id
  const purchaseUserIds = new Set<string>();
  for (const e of events) {
    const userId = extractUserId(e);
    if (userId) purchaseUserIds.add(userId);
  }
  if (purchaseUserIds.size > 0) {
    const { data: extra } = await admin
      .from("profiles")
      .select("id, email, name")
      .in("id", Array.from(purchaseUserIds));
    (extra as ProfileLookup[] | null)?.forEach((p) => {
      profileMap.set(p.id, p);
    });
  }

  const recentPurchases = events
    .filter(
      (e) =>
        e.type === "checkout.session.completed" ||
        e.type === "checkout.session.async_payment_succeeded" ||
        e.type === "invoice.paid" ||
        e.type === "customer.subscription.created" ||
        e.type === "customer.subscription.updated",
    )
    .slice(0, 10)
    .map((e) => {
      const userId = extractUserId(e);
      const { amountBrl, plan, sessionId } = extractAmountPlan(e);
      return {
        eventId: e.id,
        type: e.type,
        plan,
        amountBrl,
        userEmail: userId ? (profileMap.get(userId)?.email ?? null) : null,
        receivedAt: e.created_at,
        processedAt: e.processed_at,
        sessionId,
        fromReferral: !!userId && referredIds.has(userId),
      };
    });

  const payload: MarketingExtrasPayload = {
    referrals: {
      totalCodes: codes.length,
      totalClicks: totals.clicks,
      totalSignups: totals.signups,
      totalPaid: totals.paid,
      totalRewardBrl: Number(totals.rewardBrl.toFixed(2)),
      topAmbassadors,
      recentRedemptions,
    },
    leadMagnet: {
      totalLeads: leads.length,
      bonusCredited,
      bonusPending,
      last7d: leads7dRes.count ?? 0,
      recentLeads,
    },
    recentPurchases,
    fetchedAt: new Date().toISOString(),
  };

  return NextResponse.json(payload);
}

function extractUserId(e: StripeEventRow): string | null {
  const p = (e.payload ?? {}) as {
    data?: {
      object?: {
        client_reference_id?: string;
        metadata?: { user_id?: string };
        subscription_details?: { metadata?: { user_id?: string } };
      };
    };
  };
  const obj = p.data?.object;
  return (
    obj?.client_reference_id ??
    obj?.metadata?.user_id ??
    obj?.subscription_details?.metadata?.user_id ??
    null
  );
}

function extractAmountPlan(e: StripeEventRow): {
  amountBrl: number | null;
  plan: string | null;
  sessionId: string | null;
} {
  const p = (e.payload ?? {}) as {
    data?: {
      object?: {
        id?: string;
        amount_total?: number;
        amount_paid?: number;
        currency?: string;
        items?: { data?: Array<{ price?: { nickname?: string; id?: string } }> };
        metadata?: { plan?: string };
      };
    };
  };
  const obj = p.data?.object;
  const cents =
    typeof obj?.amount_total === "number"
      ? obj.amount_total
      : typeof obj?.amount_paid === "number"
        ? obj.amount_paid
        : null;
  const amountBrl = cents !== null ? cents / 100 : null;
  const plan =
    obj?.metadata?.plan ??
    obj?.items?.data?.[0]?.price?.nickname ??
    null;
  const sessionId =
    e.type.startsWith("checkout.session") && obj?.id ? obj.id : null;
  return { amountBrl, plan, sessionId };
}
