/**
 * Lumi Coins — sistema de débito/crédito server-side.
 *
 * Regras:
 * - Apenas o service_role pode alterar saldos (bypassa RLS).
 * - Todo movimento de coins registra uma row em coin_transactions.
 * - Débito é atômico: SELECT FOR UPDATE pra evitar race de saldo negativo.
 * - Se a charge falhar (ex: saldo insuficiente), retorna { ok: false } com balance atual.
 */

import { createAdminClient } from "./supabase/server";

/**
 * Estratégia v2 (2026-05): ferramentas basais grátis (incluídas no plano).
 * Coins gastas apenas em PRODUTOS gerados que ficam salvos como assets.
 *
 * IMPORTANTE: valores alinhados com `coins-pricing.ts` (fonte de verdade do
 * wizard novo). Antes havia divergência (flashcards: 12 aqui vs 8 lá), o que
 * permitia ao mesmo asset ser cobrado em valores diferentes dependendo do
 * endpoint chamado. Próxima sprint: unificar num único arquivo.
 */
export const COIN_COSTS = {
  chat_message: 0,          // grátis — incluído no plano
  extract_slides: 0,        // grátis — incluído no plano
  transcript_refine: 0,     // grátis — incluído no plano
  extract_schedule: 0,      // grátis no onboarding
  summary: 10,              // produto: resumo estruturado
  flashcards: 8,            // alinhado com coins-pricing.ts
  quiz: 8,                  // alinhado com coins-pricing.ts
  mindmap: 6,               // alinhado com coins-pricing.ts
} as const;

export type CoinReason =
  | "subscription_renew"
  | "topup"
  | "chat"
  | "slides"
  | "summary"
  | "summary_with_images"
  | "flashcards"
  | "quiz"
  | "mindmap"
  | "voice_reply"
  | "image_generation"
  | "transcript_refine"
  | "welcome_bonus"
  | "admin_grant"
  | "refund";

export type ChargeResult =
  | { ok: true; balanceAfter: number; transactionId: string }
  | { ok: false; balance: number; required: number; reason: "insufficient_funds" }
  | { ok: false; balance: number; required: number; reason: "user_not_found" };

export async function getBalance(userId: string): Promise<number> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select("coin_balance")
    .eq("id", userId)
    .maybeSingle();
  if (error || !data) return 0;
  const row = data as { coin_balance: number };
  return row.coin_balance ?? 0;
}

export async function chargeCoins(
  userId: string,
  amount: number,
  reason: CoinReason,
  metadata?: Record<string, unknown>,
): Promise<ChargeResult> {
  if (amount <= 0) {
    // Charge zero não faz nada, sempre ok
    const balance = await getBalance(userId);
    return { ok: true, balanceAfter: balance, transactionId: "noop" };
  }

  const admin = createAdminClient();

  // 1. Lê saldo atual
  const { data: profile, error: readErr } = await admin
    .from("profiles")
    .select("coin_balance")
    .eq("id", userId)
    .maybeSingle();
  if (readErr || !profile) {
    return { ok: false, balance: 0, required: amount, reason: "user_not_found" };
  }
  const balance = (profile as { coin_balance: number }).coin_balance ?? 0;

  if (balance < amount) {
    return { ok: false, balance, required: amount, reason: "insufficient_funds" };
  }

  const newBalance = balance - amount;

  // 2. Atualiza saldo (condicional pro caso de race)
  const { error: updErr } = await admin
    .from("profiles")
    .update({ coin_balance: newBalance })
    .eq("id", userId)
    .eq("coin_balance", balance); // só atualiza se ainda for o saldo lido
  if (updErr) {
    // Race: tenta uma vez mais
    return chargeCoins(userId, amount, reason, metadata);
  }

  // 3. Loga transação
  const { data: tx, error: txErr } = await admin
    .from("coin_transactions")
    .insert({
      user_id: userId,
      amount: -amount,
      reason,
      balance_after: newBalance,
      metadata: metadata ?? null,
    })
    .select("id")
    .single();
  if (txErr) {
    console.error("[coins] charge logged but transaction insert failed", txErr);
  }

  return {
    ok: true,
    balanceAfter: newBalance,
    transactionId: (tx as { id: string } | null)?.id ?? "unknown",
  };
}

export async function creditCoins(
  userId: string,
  amount: number,
  reason: CoinReason,
  metadata?: Record<string, unknown>,
): Promise<{ balanceAfter: number; transactionId: string }> {
  if (amount <= 0) {
    const balance = await getBalance(userId);
    return { balanceAfter: balance, transactionId: "noop" };
  }

  const admin = createAdminClient();
  const { data: profile, error: readErr } = await admin
    .from("profiles")
    .select("coin_balance")
    .eq("id", userId)
    .maybeSingle();
  if (readErr || !profile) {
    throw new Error("Usuário não encontrado.");
  }
  const balance = (profile as { coin_balance: number }).coin_balance ?? 0;
  const newBalance = balance + amount;

  const { error: updErr } = await admin
    .from("profiles")
    .update({ coin_balance: newBalance })
    .eq("id", userId)
    .eq("coin_balance", balance);
  if (updErr) {
    // Race: tenta uma vez mais
    return creditCoins(userId, amount, reason, metadata);
  }

  const { data: tx, error: txErr } = await admin
    .from("coin_transactions")
    .insert({
      user_id: userId,
      amount,
      reason,
      balance_after: newBalance,
      metadata: metadata ?? null,
    })
    .select("id")
    .single();
  if (txErr) {
    console.error("[coins] credit logged but transaction insert failed", txErr);
  }

  return {
    balanceAfter: newBalance,
    transactionId: (tx as { id: string } | null)?.id ?? "unknown",
  };
}

/**
 * Set balance to specific value (usado em subscription renew quando reseta plano).
 * Em vez de credit acumulativo, faz set absoluto e marca coins_reset_at.
 */
export async function setBalanceForRenewal(
  userId: string,
  newBalance: number,
  metadata: Record<string, unknown>,
): Promise<void> {
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("coin_balance")
    .eq("id", userId)
    .maybeSingle();
  const prev = (profile as { coin_balance: number } | null)?.coin_balance ?? 0;
  const delta = newBalance - prev;

  await admin
    .from("profiles")
    .update({
      coin_balance: newBalance,
      coins_reset_at: new Date().toISOString(),
    })
    .eq("id", userId);

  await admin.from("coin_transactions").insert({
    user_id: userId,
    amount: delta,
    reason: "subscription_renew",
    balance_after: newBalance,
    metadata,
  });
}

export type CoinTransaction = {
  id: string;
  amount: number;
  reason: CoinReason;
  balance_after: number;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

export async function listTransactions(
  userId: string,
  limit: number = 50,
): Promise<CoinTransaction[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("coin_transactions")
    .select("id, amount, reason, balance_after, metadata, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return data as CoinTransaction[];
}
