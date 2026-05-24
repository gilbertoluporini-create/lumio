/**
 * GET /api/cron/health-check
 *
 * Cron diário (Vercel Cron) que:
 *  1. Consulta saldo real ElevenLabs via API.
 *  2. Calcula gasto agregado 24h via ai_usage_log.
 *  3. Se gasto agregado > ALERT_THRESHOLD_USD → envia email pro admin.
 *  4. Salva snapshot em app_config pra alimentar /admin/health.
 *
 * Autenticação: Vercel adiciona `Authorization: Bearer <CRON_SECRET>` automático
 * quando o cron dispara. Em prod, valide; em dev, deixe passar.
 *
 * Schedule em vercel.json: "0 8 * * *" (8h UTC = 5h BRT).
 */

import { Resend } from "resend";
import { createAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ELEVENLABS_USER_URL = "https://api.elevenlabs.io/v1/user/subscription";
const ALERT_THRESHOLD_USD = Number(process.env.DAILY_ALERT_THRESHOLD_USD ?? 20);
const ALERT_EMAIL = process.env.ALERT_EMAIL ?? "gilbertoluporini@gmail.com";
const RESEND_FROM = process.env.RESEND_FROM ?? "Lumio Alerts <no-reply@lumioapp.net>";

type ElevenLabsSubscription = {
  character_count?: number;
  character_limit?: number;
  next_character_count_reset_unix?: number | null;
  status?: string;
  tier?: string;
};

async function fetchElevenLabsBalance(): Promise<{
  remaining_chars: number;
  remaining_usd: number;
  used_chars: number;
  total_chars: number;
  tier?: string;
} | null> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return null;
  try {
    const r = await fetch(ELEVENLABS_USER_URL, {
      headers: { "xi-api-key": apiKey },
    });
    if (!r.ok) {
      console.warn("[cron/health] elevenlabs subscription non-ok", r.status);
      return null;
    }
    const data = (await r.json()) as ElevenLabsSubscription;
    const used = data.character_count ?? 0;
    const total = data.character_limit ?? 0;
    const remaining = Math.max(0, total - used);
    return {
      remaining_chars: remaining,
      remaining_usd: Number((remaining * 0.0003).toFixed(2)),
      used_chars: used,
      total_chars: total,
      tier: data.tier,
    };
  } catch (err) {
    console.warn("[cron/health] elevenlabs fetch failed", err);
    return null;
  }
}

async function get24hAggregateUsd(): Promise<{
  totalUsd: number;
  byEndpoint: Array<{ endpoint: string; usd: number; calls: number }>;
}> {
  const admin = createAdminClient();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data } = await admin
    .from("ai_usage_log")
    .select("endpoint, cost_usd")
    .gte("created_at", since);
  const rows =
    (data as Array<{ endpoint: string | null; cost_usd: number | string | null }> | null) ?? [];
  let total = 0;
  const map = new Map<string, { usd: number; calls: number }>();
  for (const r of rows) {
    const u = Number(r.cost_usd ?? 0);
    total += u;
    const ep = r.endpoint ?? "unknown";
    const cur = map.get(ep) ?? { usd: 0, calls: 0 };
    cur.usd += u;
    cur.calls += 1;
    map.set(ep, cur);
  }
  return {
    totalUsd: Number(total.toFixed(4)),
    byEndpoint: Array.from(map.entries())
      .map(([endpoint, v]) => ({
        endpoint,
        usd: Number(v.usd.toFixed(4)),
        calls: v.calls,
      }))
      .sort((a, b) => b.usd - a.usd),
  };
}

async function saveSnapshot(payload: Record<string, unknown>) {
  const admin = createAdminClient();
  await admin.from("app_config").upsert({
    key: "health.snapshot",
    value: payload,
    updated_at: new Date().toISOString(),
    updated_by: "cron",
  });
}

async function maybeSendAlert(opts: {
  totalUsd: number;
  threshold: number;
  byEndpoint: Array<{ endpoint: string; usd: number; calls: number }>;
  elevenlabs: Awaited<ReturnType<typeof fetchElevenLabsBalance>>;
}): Promise<{ sent: boolean; reason?: string }> {
  if (opts.totalUsd < opts.threshold) {
    return { sent: false, reason: "below_threshold" };
  }
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { sent: false, reason: "no_resend_key" };

  // Dedup: não enviar 2x em 6h
  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("app_config")
    .select("value")
    .eq("key", "health.last_alert_sent_at")
    .maybeSingle();
  const lastSent = (existing as { value?: { iso?: string } } | null)?.value?.iso;
  if (lastSent && Date.now() - new Date(lastSent).getTime() < 6 * 60 * 60 * 1000) {
    return { sent: false, reason: "deduped_6h" };
  }

  const resend = new Resend(apiKey);
  const ellinha = opts.elevenlabs
    ? `ElevenLabs: $${opts.elevenlabs.remaining_usd.toFixed(2)} restantes (${opts.elevenlabs.used_chars.toLocaleString("pt-BR")} / ${opts.elevenlabs.total_chars.toLocaleString("pt-BR")} chars usados)`
    : "ElevenLabs: API indisponível";
  const epLines = opts.byEndpoint
    .slice(0, 5)
    .map((e) => `  ${e.endpoint}: $${e.usd.toFixed(2)} (${e.calls} calls)`)
    .join("\n");

  try {
    await resend.emails.send({
      from: RESEND_FROM,
      to: ALERT_EMAIL,
      subject: `[Lumio Alert] Gasto IA 24h: $${opts.totalUsd.toFixed(2)} (limite $${opts.threshold})`,
      text: `Gasto agregado nas últimas 24h passou do limite.\n\nTotal: $${opts.totalUsd.toFixed(2)} USD\nLimite configurado: $${opts.threshold.toFixed(2)} USD\n\n${ellinha}\n\nTop endpoints:\n${epLines}\n\nPainel: https://admin.lumioapp.net/admin/health\n\n— Lumio Health Check (cron)`,
    });
    await admin.from("app_config").upsert({
      key: "health.last_alert_sent_at",
      value: {
        iso: new Date().toISOString(),
        usd: opts.totalUsd,
        threshold: opts.threshold,
      },
      updated_at: new Date().toISOString(),
      updated_by: "cron",
    });
    return { sent: true };
  } catch (err) {
    console.error("[cron/health] resend failed", err);
    return { sent: false, reason: "resend_error" };
  }
}

export async function GET(request: Request) {
  // Validar cron secret em prod (Vercel manda automático)
  const auth = request.headers.get("authorization") ?? "";
  const expected = process.env.CRON_SECRET;
  if (process.env.NODE_ENV === "production" && expected) {
    if (auth !== `Bearer ${expected}`) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const [elevenlabs, agg] = await Promise.all([
    fetchElevenLabsBalance(),
    get24hAggregateUsd(),
  ]);

  const snapshot = {
    fetched_at: new Date().toISOString(),
    threshold_usd: ALERT_THRESHOLD_USD,
    total_usd_24h: agg.totalUsd,
    by_endpoint_24h: agg.byEndpoint,
    elevenlabs,
  };
  await saveSnapshot(snapshot);

  const alert = await maybeSendAlert({
    totalUsd: agg.totalUsd,
    threshold: ALERT_THRESHOLD_USD,
    byEndpoint: agg.byEndpoint,
    elevenlabs,
  });

  return Response.json({ ok: true, snapshot, alert });
}
