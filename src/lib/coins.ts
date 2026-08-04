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
  | { ok: false; balance: number; required: number; reason: "user_not_found" }
  // Falha TRANSITÓRIA do RPC (rede, timeout, deadlock) — NÃO é saldo insuficiente.
  | { ok: false; balance: number; required: number; reason: "transient_error" };

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
    // Exception do RPC (rede/timeout/deadlock/permissão) — NÃO significa saldo
    // insuficiente. Se marcássemos insufficient_funds, um user COM saldo veria
    // "Saldo insuficiente" numa falha transitória. Propaga como transient_error
    // pra o caller tratar como erro genérico (retry/fallback), não upsell.
    console.error("[coins] debit_coins RPC failed", error.message);
    const balance = await getBalance(userId);
    return { ok: false, balance, required: amount, reason: "transient_error" };
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

/* ────────────────────────────────────────────────────────────────────────────
   LIQUIDAÇÃO DE COBRANÇA — cobrança que sobrevive à morte da função

   O problema: cobramos ANTES de chamar a IA (pra evitar geração de graça em
   requests concorrentes) e devolvemos no catch se falhar. Só que quando a
   função Vercel é MORTA por timeout, não existe catch: o processo some no meio
   e o estorno nunca roda. O aluno paga e não recebe nada.

   Aconteceu em 03/08: um resumo de 40 coins com erro e nenhum estorno na
   tabela. O cron `reconcile-charges` já existia, mas só varre resumo educativo
   e precisa ADIVINHAR, pelo artefato salvo, se o trabalho terminou — o próprio
   docblock dele registra que o caminho do /api/ai/generate ficou de fora.

   A saída aqui não é o cron adivinhar melhor, é a cobrança DIZER. Toda
   cobrança marcada com `requiresSettlement` nasce pendente; quem termina (em
   sucesso OU em estorno) chama `settleCharge`. O que sobrar pendente depois da
   janela é, por definição, trabalho que morreu no meio — e vira estorno
   automático, sem o cron precisar saber o que a rota fazia.

   Só cobrança NOVA carrega a marca: as antigas não têm a chave e o varredor
   nem olha pra elas.
   ──────────────────────────────────────────────────────────────────────────── */

/** Marca que a linha de metadata usa pra dizer "ainda não terminou". */
export const SETTLEMENT_PENDING = "pending";

/**
 * Cobra marcando a transação como PENDENTE de liquidação. Use em toda rota que
 * faz trabalho longo (IA) depois de cobrar. Quem chama assume o compromisso de
 * chamar `settleCharge` nos dois desfechos — senão o varredor devolve os coins
 * mesmo tendo dado certo.
 */
export async function chargePending(
  userId: string,
  amount: number,
  reason: CoinReason,
  metadata?: Record<string, unknown>,
): Promise<ChargeResult> {
  return chargeCoins(userId, amount, reason, {
    ...(metadata ?? {}),
    settlement: SETTLEMENT_PENDING,
  });
}

/**
 * Fecha a cobrança. Chame TAMBÉM quando estornar em tempo de execução: sem
 * isso o varredor devolveria os coins uma segunda vez.
 *
 * Nunca lança: falhar aqui significa, no pior caso, um estorno indevido lá na
 * frente — e derrubar a resposta de uma geração que DEU CERTO por causa disso
 * seria trocar um problema pequeno por um grande.
 */
export async function settleCharge(
  transactionId: string,
  outcome: "done" | "refunded",
): Promise<void> {
  if (!transactionId || transactionId === "noop" || transactionId === "unknown") {
    return;
  }
  try {
    const admin = createAdminClient();
    await admin
      .from("coin_transactions")
      .update({ reconciled_at: new Date().toISOString() })
      .eq("id", transactionId)
      .is("reconciled_at", null);
    void outcome; // fica no log da rota; a coluna só precisa saber que fechou
  } catch (e) {
    console.error("[coins] settleCharge falhou", transactionId, e);
  }
}
