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
/**
 * REBALANCE 2026-06 (modelo híbrido): valores ajustados pra margem positiva
 * em TODOS os tiers, inclusive Power (R$0,119/coin após grant 1500→1000).
 * Esta é a FONTE DE VERDADE dos custos por asset. coin-costs.ts e
 * coins-pricing.ts espelham EXATAMENTE estes valores (mesmo asset = mesmo
 * preço em qualquer endpoint). Custo de API estimado em R$ (USD×5,5).
 */
export const COIN_COSTS = {
  chat_message: 0,          // grátis — incluído no plano
  extract_slides: 0,        // grátis — incluído no plano
  transcript_refine: 0,     // grátis — incluído no plano
  extract_schedule: 0,      // grátis no onboarding
  summary: 12,              // resumo estruturado (Sonnet ~R$0,94) — margem ~3x Pro
  summary_educational: 40,  // educativo + 3 imagens (~R$3,69) — margem +29% no Power
  summary_educational_cross: 55, // educativo + PDFs da matéria cruzados
  summary_atlas: 65,        // educativo cruzado + imagens REAIS dos PDFs do user
  transcript_structure: 15, // revisão + capítulos por IA (Sonnet) — por chunk ~25min
  flashcards: 10,           // Sonnet ~R$0,94
  quiz: 10,                 // Sonnet ~R$0,94
  mindmap: 12,              // Sonnet + 1 imagem (~R$1,16)
  routine: 12,              // rotina semanal em PDF (Lumio brand)
  study_plan: 10,           // trilha desenhada pela Lumi
  slide_sync: 3,            // correlaciona slides do PDF com capítulos (Haiku ~R$0,03)
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
  | "routine"
  | "study_plan"
  | "voice_reply"
  | "image_generation"
  | "transcript_refine"
  | "transcript_structure"
  | "summary_educational"
  | "summary_educational_cross"
  | "summary_atlas"
  | "slide_sync"
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

  // Débito ATÔMICO via RPC (migration 049): UPDATE ... WHERE coin_balance >=
  // amount RETURNING. Trava a row → impossível 2 requests concorrentes
  // debitarem abaixo do saldo (o bug antigo permitia geração de graça).
  const { data, error } = await admin.rpc("debit_coins", {
    p_user_id: userId,
    p_amount: amount,
    p_reason: reason,
    p_metadata: metadata ?? null,
  });

  if (error) {
    console.error("[coins] debit_coins RPC failed", error.message);
    const balance = await getBalance(userId);
    return { ok: false, balance, required: amount, reason: "insufficient_funds" };
  }

  // RPC retorna 1 row { ok, balance_after, tx_id, current_balance }
  const row = (Array.isArray(data) ? data[0] : data) as
    | {
        ok: boolean;
        balance_after: number | null;
        tx_id: string | null;
        current_balance: number;
      }
    | undefined;

  if (!row || !row.ok) {
    return {
      ok: false,
      balance: row?.current_balance ?? 0,
      required: amount,
      reason: "insufficient_funds",
    };
  }

  return {
    ok: true,
    balanceAfter: row.balance_after ?? 0,
    transactionId: row.tx_id ?? "unknown",
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

  // Crédito ATÔMICO via RPC (migration 049). Sem read-then-write race nem
  // recursão infinita. Refund/bônus nunca "somem" por contenção.
  const { data, error } = await admin.rpc("credit_coins", {
    p_user_id: userId,
    p_amount: amount,
    p_reason: reason,
    p_metadata: metadata ?? null,
  });
  if (error) {
    console.error("[coins] credit_coins RPC failed", error.message);
    throw new Error("Falha ao creditar coins.");
  }

  const row = (Array.isArray(data) ? data[0] : data) as
    | { balance_after: number; tx_id: string | null }
    | undefined;

  return {
    balanceAfter: row?.balance_after ?? 0,
    transactionId: row?.tx_id ?? "unknown",
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
  // Set absoluto ATÔMICO via RPC (migration 049): lê prev com FOR UPDATE e
  // grava na mesma transação, isolado de débitos concorrentes.
  const { error } = await admin.rpc("set_coins_for_renewal", {
    p_user_id: userId,
    p_new_balance: newBalance,
    p_metadata: metadata,
  });
  if (error) {
    console.error("[coins] set_coins_for_renewal RPC failed", error.message);
    throw new Error("Falha ao resetar coins na renovação.");
  }
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
