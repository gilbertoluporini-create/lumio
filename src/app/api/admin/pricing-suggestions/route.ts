/**
 * GET /api/admin/pricing-suggestions
 *
 * Analisa ai_usage_log dos últimos 30 dias e compara o custo real médio
 * de cada feature com o pricing atual (coins-pricing.ts). Sugere ajuste
 * quando a margem cai abaixo do target.
 *
 * Cada coin vale ~R$0,08 no plano Power (1500 coins / R$119).
 * Margem mínima saudável: 50%. Ideal: 70%+.
 */

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/server";
import { COIN_COSTS } from "@/lib/coins-pricing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Coin → BRL (referência: plano Power, coin mais barata)
const COIN_BRL_VALUE = 119 / 1500; // ~R$0,079
const USD_TO_BRL = 5.5;
const TARGET_MARGIN = 0.7;
const MIN_MARGIN = 0.5;

type Endpoint =
  | "/api/tts"
  | "/api/ai/generate"
  | "/api/ai/generate-images"
  | "/api/ai/summary-images"
  | "/api/chat"
  | "/api/flashcards"
  | "/api/quiz"
  | "/api/mindmap"
  | "/api/correlate";

const ENDPOINT_TO_COIN_KEY: Partial<Record<Endpoint, keyof typeof COIN_COSTS>> = {
  "/api/tts": "voiceReply",
  "/api/ai/generate-images": "summaryWithImages",
  // /api/ai/generate cobra dinâmico (computeCost), tratado separado
};

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const admin = createAdminClient();
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data } = await admin
    .from("ai_usage_log")
    .select("endpoint, cost_usd, coins_charged")
    .gte("created_at", since);
  const rows =
    (data as Array<{
      endpoint: string | null;
      cost_usd: number | string | null;
      coins_charged: number | null;
    }> | null) ?? [];

  // Agrupa por endpoint
  type Agg = { calls: number; totalUsd: number; totalCoins: number };
  const map = new Map<string, Agg>();
  for (const r of rows) {
    const ep = r.endpoint ?? "unknown";
    const cur = map.get(ep) ?? { calls: 0, totalUsd: 0, totalCoins: 0 };
    cur.calls += 1;
    cur.totalUsd += Number(r.cost_usd ?? 0);
    cur.totalCoins += Number(r.coins_charged ?? 0);
    map.set(ep, cur);
  }

  // Monta sugestões
  type Suggestion = {
    endpoint: string;
    coinKey?: string;
    calls: number;
    avgCostUsd: number;
    avgCostBrl: number;
    currentCoins: number | "dynamic";
    currentRevenueBrl: number;
    marginPct: number;
    status: "ok" | "warning" | "critical";
    suggestedCoins?: number;
    note: string;
  };

  const suggestions: Suggestion[] = [];
  for (const [endpoint, agg] of map.entries()) {
    if (agg.calls < 5) continue; // amostra muito pequena
    const avgCostUsd = agg.totalUsd / agg.calls;
    const avgCostBrl = avgCostUsd * USD_TO_BRL;
    const avgCoins = agg.totalCoins / agg.calls;
    const currentRevenueBrl = avgCoins * COIN_BRL_VALUE;
    const margin =
      currentRevenueBrl > 0
        ? (currentRevenueBrl - avgCostBrl) / currentRevenueBrl
        : -1;
    const status: Suggestion["status"] =
      margin >= TARGET_MARGIN
        ? "ok"
        : margin >= MIN_MARGIN
          ? "warning"
          : "critical";

    // Sugestão: número de coins pra atingir TARGET_MARGIN
    const suggestedRevenueBrl = avgCostBrl / (1 - TARGET_MARGIN);
    const suggestedCoins = Math.ceil(suggestedRevenueBrl / COIN_BRL_VALUE);

    const coinKey = ENDPOINT_TO_COIN_KEY[endpoint as Endpoint];

    const note =
      status === "critical"
        ? `Margem ${(margin * 100).toFixed(0)}% — subir pra ${suggestedCoins} coins (alvo ${(TARGET_MARGIN * 100).toFixed(0)}%)`
        : status === "warning"
          ? `Margem ${(margin * 100).toFixed(0)}% — considerar subir pra ${suggestedCoins} coins`
          : `Margem saudável ${(margin * 100).toFixed(0)}%`;

    suggestions.push({
      endpoint,
      coinKey: coinKey ?? undefined,
      calls: agg.calls,
      avgCostUsd: Number(avgCostUsd.toFixed(6)),
      avgCostBrl: Number(avgCostBrl.toFixed(4)),
      currentCoins:
        coinKey && typeof COIN_COSTS[coinKey] === "number"
          ? (COIN_COSTS[coinKey] as number)
          : "dynamic",
      currentRevenueBrl: Number(currentRevenueBrl.toFixed(4)),
      marginPct: Number((margin * 100).toFixed(1)),
      status,
      suggestedCoins: margin < TARGET_MARGIN ? suggestedCoins : undefined,
      note,
    });
  }

  suggestions.sort((a, b) => a.marginPct - b.marginPct);

  return NextResponse.json({
    windowDays: 30,
    coinBrlValue: Number(COIN_BRL_VALUE.toFixed(4)),
    targetMargin: TARGET_MARGIN,
    minMargin: MIN_MARGIN,
    suggestions,
    fetchedAt: new Date().toISOString(),
  });
}
