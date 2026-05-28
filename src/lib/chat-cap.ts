/**
 * Cap diário de mensagens de chat por plano.
 *
 * POR QUE: chat custa 1 coin/msg mas roda Haiku 4.5 (~R$0,06/msg normal,
 * até ~R$0,15 em conversa pesada com RAG+histórico grande). No plano Power
 * o coin vale só R$0,079 — então conversas pesadas podem ficar no negativo.
 * Um teto diário de mensagens limita o downside no pico sem incomodar o
 * uso típico (os caps são bem acima da média diária de coins do plano).
 *
 * Conta transações reason="chat" nas últimas 24h via coin_transactions.
 * Admin/founder não têm cap.
 *
 * Caps escolhidos pelo founder (28/05/2026), perfil "generoso":
 *   free 15 · starter 30 · pro 60 · power 120 por dia.
 */

import { createAdminClient } from "./supabase/server";

export const CHAT_DAILY_CAP: Record<string, number> = {
  free: 15,
  starter: 30,
  pro: 60,
  power: 120,
  annual: 60, // anual ≈ equivalente ao Pro
};

const DEFAULT_CAP = CHAT_DAILY_CAP.free;

export type ChatCapResult = {
  ok: boolean;
  used: number;
  cap: number;
  plan: string;
  /** true quando passou de 80% do cap — frontend pode avisar antecipadamente */
  nearLimit: boolean;
};

/** Resolve o plano efetivo do user (free se sem subscription ativa). */
async function resolvePlan(userId: string): Promise<string> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("subscriptions")
    .select("plan, status")
    .eq("user_id", userId)
    .maybeSingle();
  const row = data as { plan?: string; status?: string } | null;
  if (!row || row.status !== "active") return "free";
  return row.plan ?? "free";
}

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
 * Verifica se o user ainda pode mandar mensagem de chat hoje.
 * Retorna ok:false quando bateu o cap. Inclui `nearLimit` pra aviso.
 */
export async function checkChatDailyCap(
  userId: string,
): Promise<ChatCapResult> {
  if (await isAdminOrFounder(userId)) {
    return { ok: true, used: 0, cap: Infinity, plan: "admin", nearLimit: false };
  }
  const plan = await resolvePlan(userId);
  const cap = CHAT_DAILY_CAP[plan] ?? DEFAULT_CAP;

  const admin = createAdminClient();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count } = await admin
    .from("coin_transactions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("reason", "chat")
    .gte("created_at", since);

  const used = count ?? 0;
  return {
    ok: used < cap,
    used,
    cap,
    plan,
    nearLimit: used >= Math.floor(cap * 0.8),
  };
}

/** Resposta 429 padronizada quando o cap de chat é atingido. */
export function chatCapResponse(result: ChatCapResult): Response {
  return Response.json(
    {
      error: `Você atingiu o limite de ${result.cap} perguntas no chat por hoje (plano ${result.plan}). O limite renova em algumas horas — ou gera um resumo/quiz que rende mais por coin. Precisa de mais? Considere um plano acima.`,
      code: "chat_daily_cap_reached",
      used: result.used,
      cap: result.cap,
      plan: result.plan,
    },
    { status: 429 },
  );
}
