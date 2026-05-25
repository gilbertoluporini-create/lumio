/**
 * Resgate de coins bônus do lead magnet "Guia de Revisão".
 *
 * Fluxo: quando o user baixa o PDF e ainda NÃO tem conta, o endpoint
 * /api/leads/magnet salva intenção em leads.metadata.bonus_coins = 50.
 *
 * Quando esse mesmo email criar conta (signup-password ou callback),
 * basta chamar `redeemLeadMagnetBonusIfPending({ userId, email })` que:
 *  - localiza o lead pendente por email
 *  - credita as coins no profile
 *  - marca metadata.bonus_credited = true pra não duplicar
 *
 * É idempotente: se já foi creditado, retorna { credited: false, reason: "already_credited" }.
 *
 * INTEGRAÇÃO SUGERIDA (founder faz quando quiser; não toquei nos arquivos M):
 *   - src/app/auth/callback/route.ts → após `getUser()`/criação confirmada,
 *     chamar `await redeemLeadMagnetBonusIfPending({ userId: user.id, email: user.email })`
 *   - src/app/api/auth/signup-password/route.ts → após signUp success
 *
 * Falha silenciosa: nunca lança — só loga.
 */

import { createAdminClient } from "@/lib/supabase/server";
import { creditCoins } from "@/lib/coins";

export type RedeemResult =
  | { credited: true; amount: number; leadId: string }
  | { credited: false; reason: "no_pending_lead" | "already_credited" | "error" };

export async function redeemLeadMagnetBonusIfPending(opts: {
  userId: string;
  email: string | null | undefined;
}): Promise<RedeemResult> {
  const email = opts.email?.toLowerCase().trim();
  if (!email || !opts.userId) return { credited: false, reason: "no_pending_lead" };

  const admin = createAdminClient();

  try {
    const { data: lead } = await admin
      .from("leads")
      .select("id, metadata")
      .eq("email", email)
      .maybeSingle();

    if (!lead) return { credited: false, reason: "no_pending_lead" };

    const meta = ((lead as { metadata?: Record<string, unknown> }).metadata ??
      {}) as Record<string, unknown>;
    const bonus = Number(meta.bonus_coins ?? 0);
    if (!bonus || bonus <= 0) {
      return { credited: false, reason: "no_pending_lead" };
    }
    if (meta.bonus_credited === true) {
      return { credited: false, reason: "already_credited" };
    }

    // Credita
    await creditCoins(opts.userId, bonus, "welcome_bonus", {
      kind: "lead_magnet_bonus",
      magnet: meta.magnet ?? "guia_revisao",
      source: meta.kind ?? "magnet_revisao",
      lead_id: (lead as { id: string }).id,
    });

    // Marca pra não duplicar
    const newMeta = {
      ...meta,
      bonus_credited: true,
      bonus_pending: false,
      bonus_credited_at: new Date().toISOString(),
      bonus_credited_user_id: opts.userId,
    };
    await admin
      .from("leads")
      .update({ metadata: newMeta, status: "converted" })
      .eq("id", (lead as { id: string }).id);

    return { credited: true, amount: bonus, leadId: (lead as { id: string }).id };
  } catch (err) {
    console.error("[lead-magnet-bonus] redeem failed", err);
    return { credited: false, reason: "error" };
  }
}
