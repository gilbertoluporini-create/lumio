/**
 * Cap diário de gasto (USD) por usuário — anti-abuse forte.
 *
 * Soma `cost_usd` de `ai_usage_log` nas últimas 24h e bloqueia novas chamadas
 * caras quando o usuário ultrapassar o teto. Admin/founder não são afetados.
 *
 * Cap default: USD $5/dia/user. Por que esse número?
 * - Power R$119/mês ≈ $24/mês = $0.80/dia em média.
 * - User pesado e legítimo pode chegar a $2-3/dia.
 * - Cap em $5 dá folga 2-3x pro user heavy e barra abuse claro (>$5/dia
 *   indica uso anômalo ou bot).
 *
 * Override via env `DAILY_COST_CAP_USD`.
 */

import { createAdminClient } from "./supabase/server";

const DEFAULT_CAP_USD = Number(process.env.DAILY_COST_CAP_USD ?? 5);

export type CostCapResult =
  | { ok: true; spentUsd: number; capUsd: number; remainingUsd: number }
  | { ok: false; spentUsd: number; capUsd: number };

/** Soma o gasto AI das últimas 24h pro user. Retorna USD. */
export async function getDailyCostUsd(userId: string): Promise<number> {
  const admin = createAdminClient();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await admin
    .from("ai_usage_log")
    .select("cost_usd")
    .eq("user_id", userId)
    .gte("created_at", since);
  if (error || !data) return 0;
  return (data as { cost_usd: number | string | null }[]).reduce(
    (sum, row) => sum + Number(row.cost_usd ?? 0),
    0,
  );
}

/** Admin/founder não tem cap (bypass legítimo pra testes + suporte). */
async function isAdminOrFounder(userId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();
  const role = (data as { role?: string } | null)?.role;
  return role === "admin" || role === "founder";
}

/**
 * Verifica se o user pode fazer uma chamada cara. Retorna `{ ok: false }`
 * com detalhes quando já bateu o cap nas últimas 24h.
 */
export async function checkDailyCostCap(
  userId: string,
  capUsd: number = DEFAULT_CAP_USD,
): Promise<CostCapResult> {
  if (await isAdminOrFounder(userId)) {
    return { ok: true, spentUsd: 0, capUsd, remainingUsd: capUsd };
  }
  const spent = await getDailyCostUsd(userId);
  if (spent >= capUsd) {
    return { ok: false, spentUsd: spent, capUsd };
  }
  return { ok: true, spentUsd: spent, capUsd, remainingUsd: capUsd - spent };
}

/**
 * Resposta padronizada pra 429 quando o cap é atingido. Mensagem amigável
 * em pt-BR, com sugestão de ação. Status 429 (Too Many Requests).
 */
export function dailyCapResponse(result: {
  spentUsd: number;
  capUsd: number;
}): Response {
  return Response.json(
    {
      error: `Limite diário de uso de IA atingido (${result.spentUsd.toFixed(2)} USD / ${result.capUsd.toFixed(2)} USD). Volta em algumas horas ou fale com o suporte se for engano.`,
      code: "daily_cost_cap_reached",
      spentUsd: Number(result.spentUsd.toFixed(4)),
      capUsd: result.capUsd,
    },
    { status: 429 },
  );
}
