/**
 * GET /api/admin/health-stats
 *
 * Métricas de saúde financeira/operacional do Lumio. Apenas admin.
 *
 * Retorna:
 *   - totalUsd24h           (soma cost_usd últimas 24h em ai_usage_log)
 *   - totalUsd7d            (soma cost_usd últimos 7 dias)
 *   - voiceReplies24h       (count coin_transactions reason=voice_reply 24h)
 *   - imagesGenerated24h    (sum images_count ai_usage_log 24h)
 *   - capHits24h            (users distintos que tiveram >=5 USD em 24h)
 *   - topSpenders           (top 10 users por cost_usd 24h)
 *   - byEndpoint            (breakdown cost_usd por endpoint 24h)
 *   - flags                 (estado atual dos kill-switches)
 */

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/server";
import { getAllFeatureFlags } from "@/lib/feature-flags";

type HealthSnapshot = {
  fetched_at?: string;
  threshold_usd?: number;
  total_usd_24h?: number;
  elevenlabs?: {
    remaining_chars?: number;
    remaining_usd?: number;
    used_chars?: number;
    total_chars?: number;
    tier?: string;
  } | null;
};

type LastAlert = { iso?: string; usd?: number; threshold?: number };

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CAP_USD = Number(process.env.DAILY_COST_CAP_USD ?? 5);

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const admin = createAdminClient();
  const now = Date.now();
  const since24h = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const since7d = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Usage 24h (cost + tokens + images + endpoint)
  const { data: usage24hRaw } = await admin
    .from("ai_usage_log")
    .select("user_id, endpoint, cost_usd, input_tokens, output_tokens, images_count")
    .gte("created_at", since24h);
  const usage24h =
    (usage24hRaw as Array<{
      user_id: string | null;
      endpoint: string | null;
      cost_usd: number | string | null;
      input_tokens: number | null;
      output_tokens: number | null;
      images_count: number | null;
    }> | null) ?? [];

  let totalUsd24h = 0;
  let imagesGenerated24h = 0;
  const byEndpointMap = new Map<string, { usd: number; calls: number }>();
  const byUserMap = new Map<string, number>();
  for (const row of usage24h) {
    const u = Number(row.cost_usd ?? 0);
    totalUsd24h += u;
    imagesGenerated24h += Number(row.images_count ?? 0);
    const ep = row.endpoint ?? "unknown";
    const entry = byEndpointMap.get(ep) ?? { usd: 0, calls: 0 };
    entry.usd += u;
    entry.calls += 1;
    byEndpointMap.set(ep, entry);
    if (row.user_id) {
      byUserMap.set(row.user_id, (byUserMap.get(row.user_id) ?? 0) + u);
    }
  }

  // 7d total
  const { data: usage7dRaw } = await admin
    .from("ai_usage_log")
    .select("cost_usd")
    .gte("created_at", since7d);
  const totalUsd7d = ((usage7dRaw as Array<{ cost_usd: number | string | null }> | null) ?? [])
    .reduce((s, r) => s + Number(r.cost_usd ?? 0), 0);

  // Voice replies 24h
  const { count: voiceReplies24h } = await admin
    .from("coin_transactions")
    .select("id", { count: "exact", head: true })
    .eq("reason", "voice_reply")
    .gte("created_at", since24h);

  // Cap hits: users com >= CAP_USD em 24h
  const capHits24h = Array.from(byUserMap.values()).filter((v) => v >= CAP_USD).length;

  // Top 10 spenders
  const topUserIds = Array.from(byUserMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  let topSpenders: Array<{
    userId: string;
    email: string | null;
    usd: number;
    pctOfCap: number;
  }> = [];
  if (topUserIds.length > 0) {
    const ids = topUserIds.map(([id]) => id);
    const { data: profiles } = await admin
      .from("profiles")
      .select("id, email")
      .in("id", ids);
    const emailMap = new Map<string, string | null>();
    for (const p of (profiles as Array<{ id: string; email: string | null }> | null) ?? []) {
      emailMap.set(p.id, p.email);
    }
    topSpenders = topUserIds.map(([userId, usd]) => ({
      userId,
      email: emailMap.get(userId) ?? null,
      usd: Number(usd.toFixed(4)),
      pctOfCap: Math.min(100, Math.round((usd / CAP_USD) * 100)),
    }));
  }

  // By endpoint
  const byEndpoint = Array.from(byEndpointMap.entries())
    .map(([endpoint, v]) => ({
      endpoint,
      usd: Number(v.usd.toFixed(4)),
      calls: v.calls,
    }))
    .sort((a, b) => b.usd - a.usd);

  const flags = await getAllFeatureFlags();

  // Snapshot do último cron (saldo ElevenLabs)
  const { data: snapRow } = await admin
    .from("app_config")
    .select("value, updated_at")
    .eq("key", "health.snapshot")
    .maybeSingle();
  const snapshot = (snapRow as { value?: HealthSnapshot; updated_at?: string } | null) ?? null;

  // Último alerta enviado
  const { data: alertRow } = await admin
    .from("app_config")
    .select("value")
    .eq("key", "health.last_alert_sent_at")
    .maybeSingle();
  const lastAlert = (alertRow as { value?: LastAlert } | null)?.value ?? null;

  return NextResponse.json({
    capUsd: CAP_USD,
    totalUsd24h: Number(totalUsd24h.toFixed(4)),
    totalUsd7d: Number(totalUsd7d.toFixed(4)),
    voiceReplies24h: voiceReplies24h ?? 0,
    imagesGenerated24h,
    capHits24h,
    topSpenders,
    byEndpoint,
    flags,
    elevenlabs: snapshot?.value?.elevenlabs ?? null,
    snapshotFetchedAt: snapshot?.value?.fetched_at ?? null,
    alertThresholdUsd: snapshot?.value?.threshold_usd ?? Number(process.env.DAILY_ALERT_THRESHOLD_USD ?? 20),
    lastAlert,
    fetchedAt: new Date().toISOString(),
  });
}
