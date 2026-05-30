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
  providers?: {
    anthropic?: ProviderBalance | null;
    openai?: ProviderBalance | null;
    google_ai?: ProviderBalance | null;
  };
};

type ProviderBalance = {
  /** Saldo restante em USD se a Admin API expôs (cron). */
  remaining_usd?: number | null;
  /** Gasto via Admin API no mês corrente (cron). */
  usage_mtd_usd?: number | null;
  /** Quando foi consultado. */
  fetched_at?: string;
};

type ProviderKey = "anthropic" | "openai" | "google_ai" | "elevenlabs" | "other";

function deriveProvider(model: string | null): ProviderKey {
  if (!model) return "other";
  const m = model.toLowerCase();
  if (m.startsWith("claude")) return "anthropic";
  if (
    m.startsWith("gpt") ||
    m.startsWith("o1") ||
    m.startsWith("o3") ||
    m.startsWith("chatgpt") ||
    m.includes("openai")
  ) {
    return "openai";
  }
  if (m.startsWith("gemini") || m.includes("google")) return "google_ai";
  if (m.includes("eleven")) return "elevenlabs";
  return "other";
}

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

  // Mês corrente — boundary local ao primeiro dia 00:00 UTC pra consistência
  const monthStart = new Date(
    Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1),
  ).toISOString();

  // Usage 24h (cost + tokens + images + endpoint + model)
  const { data: usage24hRaw } = await admin
    .from("ai_usage_log")
    .select("user_id, endpoint, model, cost_usd, input_tokens, output_tokens, images_count")
    .gte("created_at", since24h);
  const usage24h =
    (usage24hRaw as Array<{
      user_id: string | null;
      endpoint: string | null;
      model: string | null;
      cost_usd: number | string | null;
      input_tokens: number | null;
      output_tokens: number | null;
      images_count: number | null;
    }> | null) ?? [];

  let totalUsd24h = 0;
  let imagesGenerated24h = 0;
  const byEndpointMap = new Map<string, { usd: number; calls: number }>();
  const byUserMap = new Map<string, number>();
  const byProvider24h = new Map<ProviderKey, { usd: number; calls: number }>();
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
    const prov = deriveProvider(row.model);
    const provEntry = byProvider24h.get(prov) ?? { usd: 0, calls: 0 };
    provEntry.usd += u;
    provEntry.calls += 1;
    byProvider24h.set(prov, provEntry);
  }

  // Mês corrente — agrega cost_usd por provider
  const { data: usageMtdRaw } = await admin
    .from("ai_usage_log")
    .select("model, cost_usd")
    .gte("created_at", monthStart);
  const usageMtd =
    (usageMtdRaw as Array<{
      model: string | null;
      cost_usd: number | string | null;
    }> | null) ?? [];
  const byProviderMtd = new Map<ProviderKey, number>();
  let totalUsdMtd = 0;
  for (const row of usageMtd) {
    const u = Number(row.cost_usd ?? 0);
    totalUsdMtd += u;
    const prov = deriveProvider(row.model);
    byProviderMtd.set(prov, (byProviderMtd.get(prov) ?? 0) + u);
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

  // Provider breakdown — junta gasto local (ai_usage_log) com balance real do snapshot
  const providersSnapshot = snapshot?.value?.providers ?? {};
  const providerKeys: ProviderKey[] = [
    "anthropic",
    "openai",
    "google_ai",
    "elevenlabs",
    "other",
  ];
  const providers = providerKeys.map((key) => {
    const usd24h = byProvider24h.get(key);
    const usdMtd = byProviderMtd.get(key) ?? 0;
    const snap =
      key === "anthropic" || key === "openai" || key === "google_ai"
        ? providersSnapshot[key]
        : null;
    return {
      provider: key,
      usd24h: Number((usd24h?.usd ?? 0).toFixed(4)),
      calls24h: usd24h?.calls ?? 0,
      usdMtd: Number(usdMtd.toFixed(4)),
      remainingUsd: snap?.remaining_usd ?? null,
      usageMtdReportedUsd: snap?.usage_mtd_usd ?? null,
      fetchedAt: snap?.fetched_at ?? null,
    };
  });

  return NextResponse.json({
    capUsd: CAP_USD,
    totalUsd24h: Number(totalUsd24h.toFixed(4)),
    totalUsd7d: Number(totalUsd7d.toFixed(4)),
    totalUsdMtd: Number(totalUsdMtd.toFixed(4)),
    voiceReplies24h: voiceReplies24h ?? 0,
    imagesGenerated24h,
    capHits24h,
    topSpenders,
    byEndpoint,
    providers,
    flags,
    elevenlabs: snapshot?.value?.elevenlabs ?? null,
    snapshotFetchedAt: snapshot?.value?.fetched_at ?? null,
    alertThresholdUsd: snapshot?.value?.threshold_usd ?? Number(process.env.DAILY_ALERT_THRESHOLD_USD ?? 20),
    lastAlert,
    fetchedAt: new Date().toISOString(),
  });
}
