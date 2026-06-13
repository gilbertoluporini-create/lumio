import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/server";
import { PLAN_COINS_PER_MONTH, getAppUrl, getStripe } from "@/lib/stripe";
import { sendReceiptEmail, sendWelcomeEmail } from "@/lib/email";
import { setBalanceForRenewal } from "@/lib/coins";
import { trackPurchaseServer } from "@/lib/server-analytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PlanName = "starter" | "pro" | "power" | "annual";

const PLAN_PRICE_TO_NAME: Record<string, PlanName> = (() => {
  const map: Record<string, PlanName> = {};
  if (process.env.STRIPE_PRICE_ID_STARTER)
    map[process.env.STRIPE_PRICE_ID_STARTER] = "starter";
  if (process.env.STRIPE_PRICE_ID_STARTER_ANNUAL)
    map[process.env.STRIPE_PRICE_ID_STARTER_ANNUAL] = "starter";
  if (process.env.STRIPE_PRICE_ID_PRO) map[process.env.STRIPE_PRICE_ID_PRO] = "pro";
  if (process.env.STRIPE_PRICE_ID_PRO_ANNUAL)
    map[process.env.STRIPE_PRICE_ID_PRO_ANNUAL] = "pro";
  if (process.env.STRIPE_PRICE_ID_POWER)
    map[process.env.STRIPE_PRICE_ID_POWER] = "power";
  if (process.env.STRIPE_PRICE_ID_POWER_ANNUAL)
    map[process.env.STRIPE_PRICE_ID_POWER_ANNUAL] = "power";
  if (process.env.STRIPE_PRICE_ID_ANNUAL)
    map[process.env.STRIPE_PRICE_ID_ANNUAL] = "annual";
  return map;
})();

export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "Webhook secret não configurado." },
      { status: 503 },
    );
  }

  const sig = req.headers.get("stripe-signature");
  if (!sig) return new NextResponse("missing signature", { status: 400 });

  const raw = await req.text();
  const stripe = getStripe();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(raw, sig, secret);
  } catch (err) {
    console.error("[stripe/webhook] signature failed", err);
    return new NextResponse("bad signature", { status: 400 });
  }

  // ========================================================================
  // IDEMPOTÊNCIA (Reality Check fix #6+#7):
  // Antes: inseríamos event.id ANTES do processing → se processing falhasse,
  // retry do Stripe via 23505 → 200 OK sem reprocessar → subscription perdida.
  // Agora: tenta reservar o evento. Processa. SÓ marca processed_at no sucesso.
  // Se processing falhar, DELETA o reserve pra Stripe retentar do zero.
  // ========================================================================
  const admin = createAdminClient();

  // Verifica se já foi processado com sucesso
  const { data: existing } = await admin
    .from("stripe_events")
    .select("id, processed_at")
    .eq("id", event.id)
    .maybeSingle();

  if (existing?.processed_at) {
    // Já processado completamente em retry anterior
    return NextResponse.json({ received: true, duplicate: true });
  }

  if (!existing) {
    // Reserva: tenta inserir. Se conflict (outro processo está rodando agora),
    // 23505 vira erro e respondemos 409 pra Stripe retentar mais tarde.
    const { error: insertError } = await admin
      .from("stripe_events")
      .insert({ id: event.id, type: event.type, payload: event });
    if (insertError) {
      if (insertError.code === "23505") {
        // Outro processo já reservou — responder 409 pra retry
        return new NextResponse("event in progress", { status: 409 });
      }
      console.error("[stripe/webhook] reserve failed", insertError);
      return new NextResponse("storage error", { status: 500 });
    }
  }
  // (se existing existe mas sem processed_at, somos um retry de processing
  // que falhou no passado — vamos reprocessar abaixo)

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded":
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;

      case "customer.subscription.created":
      case "customer.subscription.updated":
        await handleSubscriptionUpserted(event.data.object as Stripe.Subscription);
        break;

      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;

      case "invoice.paid":
        await handleInvoicePaid(event.data.object as Stripe.Invoice);
        break;

      case "charge.refunded":
        await handleChargeRefunded(event.data.object as Stripe.Charge);
        break;

      case "charge.dispute.created":
        await handleChargeDisputeCreated(event.data.object as Stripe.Dispute);
        break;

      case "invoice.payment_failed":
        await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
        break;

      default:
        // Aceita silenciosamente eventos não-mapeados
        break;
    }

    // Marca como processado COM SUCESSO
    await admin
      .from("stripe_events")
      .update({ processed_at: new Date().toISOString() })
      .eq("id", event.id);

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error(`[stripe/webhook] processing failed for ${event.type}`, err);
    // Remove o reserve pra Stripe retentar do zero
    await admin
      .from("stripe_events")
      .delete()
      .eq("id", event.id)
      .is("processed_at", null);
    return new NextResponse("processing failed", { status: 500 });
  }
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const userId = session.client_reference_id || session.metadata?.user_id;
  if (!userId) {
    console.warn("[webhook] checkout sem user_id", session.id);
    return;
  }

  const admin = createAdminClient();
  const subId =
    typeof session.subscription === "string"
      ? session.subscription
      : session.subscription?.id;

  const customerId =
    typeof session.customer === "string"
      ? session.customer
      : session.customer?.id;

  if (subId) {
    const stripe = getStripe();
    const sub = await stripe.subscriptions.retrieve(subId);
    await upsertSubscriptionFromStripe(userId, sub, customerId);

    // Credita coins do plano (primeira assinatura)
    const priceId = sub.items.data[0]?.price.id;
    const plan: PlanName =
      priceId && PLAN_PRICE_TO_NAME[priceId] ? PLAN_PRICE_TO_NAME[priceId] : "pro";
    try {
      await creditPlanCoins(userId, plan, sub.id);
    } catch (err) {
      console.error("[webhook] creditPlanCoins failed", err);
    }

    // Welcome email com magic link gerado (Reality Check fix #1)
    const { data: profile } = await admin
      .from("profiles")
      .select("email, name")
      .eq("id", userId)
      .single();

    if (profile?.email) {
      const magicLink = await generateMagicLink(profile.email);
      await sendWelcomeEmail({
        to: profile.email,
        name: profile.name ?? undefined,
        magicLink,
      });
    }

    // Conversion server-side (Meta CAPI + GA4 MP). Usa session.id como event_id
    // pra deduplicar com o Pixel client no /success.
    const amountTotal = typeof session.amount_total === "number" ? session.amount_total : 0;
    await trackPurchaseServer({
      userId,
      email: profile?.email ?? session.customer_details?.email ?? undefined,
      plan,
      value: amountTotal / 100,
      currency: (session.currency ?? "brl").toUpperCase(),
      sessionId: session.id,
    });

    // Programa embaixadores: acumula comissão recorrente do mês corrente.
    // (também marca redemption como paid na primeira venda, idempotente)
    try {
      await accrueAmbassadorCommission({
        referredUserId: userId,
        amountBrl: amountTotal / 100,
        plan,
      });
    } catch (err) {
      console.error("[webhook] accrueAmbassadorCommission failed", err);
    }
  } else {
    // Pagamento único (não há subscription) — ainda assim marca como ativo
    await admin
      .from("subscriptions")
      .upsert(
        {
          user_id: userId,
          stripe_customer_id: customerId ?? null,
          status: "active",
          plan: "pro",
        },
        { onConflict: "user_id" },
      );
  }
}

async function handleSubscriptionUpserted(sub: Stripe.Subscription) {
  const userId = sub.metadata?.user_id;
  if (!userId) {
    console.warn("[webhook] subscription sem user_id", sub.id);
    return;
  }
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  await upsertSubscriptionFromStripe(userId, sub, customerId);
}

async function handleSubscriptionDeleted(sub: Stripe.Subscription) {
  const userId = sub.metadata?.user_id;
  if (!userId) return;
  const admin = createAdminClient();
  await admin
    .from("subscriptions")
    .update({
      status: "canceled",
      cancel_at_period_end: false,
      stripe_subscription_id: sub.id,
    })
    .eq("user_id", userId);
}

async function handleInvoicePaid(invoice: Stripe.Invoice) {
  if (invoice.billing_reason === "subscription_create") {
    // Welcome já tratou via checkout.session.completed
    return;
  }
  const admin = createAdminClient();

  // IDs do Stripe pra fallback de resolução do user.
  const subIdRaw =
    (invoice as unknown as { subscription?: string | { id?: string } }).subscription;
  const stripeSubId =
    typeof subIdRaw === "string" ? subIdRaw : subIdRaw?.id ?? null;
  const customerRaw = (invoice as unknown as { customer?: string | { id?: string } })
    .customer;
  const stripeCustomerId =
    typeof customerRaw === "string" ? customerRaw : customerRaw?.id ?? null;

  let userId = (
    (invoice as unknown as { subscription_details?: { metadata?: { user_id?: string } } })
      .subscription_details?.metadata ??
    invoice.metadata ??
    {}
  )?.user_id;

  // Fallback: assinaturas criadas FORA do checkout (portal, dashboard Stripe,
  // migração) não carregam metadata.user_id → sem isso o assinante pagava e
  // NÃO recebia os coins do mês. Resolve pelo subscription/customer salvos.
  if (!userId && (stripeSubId || stripeCustomerId)) {
    let q = admin.from("subscriptions").select("user_id").limit(1);
    q = stripeSubId
      ? q.eq("stripe_subscription_id", stripeSubId)
      : q.eq("stripe_customer_id", stripeCustomerId as string);
    const { data: subRow } = await q.maybeSingle();
    userId = (subRow as { user_id?: string } | null)?.user_id ?? undefined;
    if (!userId) {
      console.error(
        "[webhook] invoice.paid sem user_id resolvível",
        { stripeSubId, stripeCustomerId },
      );
    }
  }
  if (!userId) return;
  const { data: profile } = await admin
    .from("profiles")
    .select("email, name")
    .eq("id", userId)
    .single();
  if (!profile?.email) return;

  const lineItem = invoice.lines?.data?.[0] as unknown as
    | { pricing?: { price_details?: { price?: string } }; price?: { id?: string } }
    | undefined;
  const priceId =
    lineItem?.pricing?.price_details?.price ?? lineItem?.price?.id ?? null;
  const plan: PlanName =
    priceId && PLAN_PRICE_TO_NAME[priceId] ? PLAN_PRICE_TO_NAME[priceId] : "pro";

  await sendReceiptEmail({
    to: profile.email,
    name: profile.name ?? undefined,
    plan: plan === "starter" || plan === "power" ? "pro" : plan, // email template suporta só pro/annual
    amount: invoice.amount_paid,
    currency: invoice.currency,
  });

  // Renovação: credita coins do plano (não duplicar com checkout — esse já filtra subscription_create)
  try {
    await creditPlanCoins(userId, plan, stripeSubId ?? "renew");
  } catch (err) {
    console.error("[webhook] creditPlanCoins on renew failed", err);
  }

  // Programa embaixadores: acumula comissão da renovação no payout do mês.
  // amount_paid é em centavos, já com desconto do cupom aplicado.
  try {
    await accrueAmbassadorCommission({
      referredUserId: userId,
      amountBrl: invoice.amount_paid / 100,
      plan,
    });
  } catch (err) {
    console.error("[webhook] accrueAmbassadorCommission on renew failed", err);
  }
}

/**
 * Refund da Stripe (parcial ou total). Reverte a comissão proporcional do
 * embaixador no mês corrente. SEM essa reversão, Lumio paga PIX cheio mesmo
 * tendo devolvido o dinheiro pro user (prejuízo direto).
 *
 * Stripe envia este evento tanto pra refunds via dashboard quanto pra refunds
 * automáticos (ex: subscription cancel + prorate). É idempotente por event.id
 * via stripe_events (dedupe na entrada do webhook).
 */
async function handleChargeRefunded(charge: Stripe.Charge) {
  // Stripe SDK 22+ removeu `invoice` do tipo Stripe.Charge (acessível só via
  // expand). API ainda devolve o campo — castamos pro shape esperado pra
  // não quebrar build com TS strict.
  const chargeWithInvoice = charge as Stripe.Charge & {
    invoice?: string | { id: string } | null;
  };
  if (!chargeWithInvoice.invoice) return; // refund avulso (não-subscription) — não há comissão
  const invoiceId =
    typeof chargeWithInvoice.invoice === "string"
      ? chargeWithInvoice.invoice
      : chargeWithInvoice.invoice.id;
  if (!invoiceId) return;

  // amount_refunded é cumulativo em centavos (Stripe). Em refunds parciais
  // sucessivos, cada evento traz o NOVO total. Pra evitar reverter duas vezes,
  // precisamos calcular só o delta — mas como o dedupe externo (stripe_events)
  // já bloqueia o mesmo event.id, basta processar o refund mais recente desse
  // evento usando o último refund da lista.
  const lastRefund = charge.refunds?.data?.[0];
  const refundedCentsThisEvent = lastRefund?.amount ?? charge.amount_refunded;
  if (!refundedCentsThisEvent || refundedCentsThisEvent <= 0) return;

  await reverseAmbassadorCommissionForRefund({
    stripeInvoiceId: invoiceId,
    refundedAmountBrl: refundedCentsThisEvent / 100,
    reason: `refund:${lastRefund?.id ?? charge.id}`,
  });
}

/**
 * Disputa aberta (chargeback). Tratamos como refund probable — reverte a
 * comissão imediatamente. Se o dispute for ganho depois, a comissão fica
 * negativa temporariamente; admin pode re-acumular manualmente.
 *
 * Alternativa mais conservadora: esperar charge.dispute.closed com status=won
 * antes de reverter. Mas como o dinheiro JÁ saiu da conta no momento do
 * dispute (Stripe segura o valor), a reversão imediata é financeiramente correta.
 */
async function handleChargeDisputeCreated(dispute: Stripe.Dispute) {
  const chargeId = typeof dispute.charge === "string" ? dispute.charge : dispute.charge?.id;
  if (!chargeId) return;

  // Recupera o charge pra achar a invoice. Disputes não carregam invoice direto.
  const stripe = getStripe();
  let charge: Stripe.Charge;
  try {
    charge = await stripe.charges.retrieve(chargeId);
  } catch (err) {
    console.error("[webhook] dispute: charge retrieve failed", err);
    return;
  }

  // Mesmo workaround SDK 22+ do handleChargeRefunded.
  const chargeWithInvoice = charge as Stripe.Charge & {
    invoice?: string | { id: string } | null;
  };
  if (!chargeWithInvoice.invoice) return;
  const invoiceId =
    typeof chargeWithInvoice.invoice === "string"
      ? chargeWithInvoice.invoice
      : chargeWithInvoice.invoice.id;
  if (!invoiceId) return;

  await reverseAmbassadorCommissionForRefund({
    stripeInvoiceId: invoiceId,
    refundedAmountBrl: dispute.amount / 100,
    reason: `dispute:${dispute.id}`,
  });
}

/**
 * invoice.payment_failed após uma invoice já ter sido marcada paid (raro —
 * ocorre em retries da Stripe quando o pagamento original cai depois). Se a
 * comissão foi acumulada via invoice.paid e depois falhou, reverte.
 */
async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  // Só nos importa se a invoice está marcada como já cobrada com sucesso E
  // depois reverteu — caso contrário, accrueAmbassadorCommission nem rodou.
  if (invoice.status !== "uncollectible" && invoice.status !== "void") {
    // Falha "normal" (1ª tentativa) — comissão nem foi acumulada
    return;
  }

  const invoiceId = invoice.id;
  if (!invoiceId) return;
  const amountPaidBrl = (invoice.amount_paid ?? 0) / 100;
  if (amountPaidBrl <= 0) return;

  await reverseAmbassadorCommissionForRefund({
    stripeInvoiceId: invoiceId,
    refundedAmountBrl: amountPaidBrl,
    reason: `payment_failed:${invoiceId}`,
  });
}

/**
 * Reverte comissão de embaixador no payout do mês corrente.
 *
 * IMPORTANTE: o schema `ambassador_payouts` agrega por MÊS, não por invoice
 * (uma row por (referral_code_id, period_start=1º do mês)). Como não há
 * tracking per-invoice, decrementamos do payout do mês em que o refund
 * acontece — não do mês original da venda.
 *
 * Trade-off: se o refund cruza meses (venda em maio, refund em junho), o
 * payout de junho pode ficar negativo. Floor em zero pra não quebrar PIX
 * positivo. O delta perdido vai pra `notes` pra auditoria do admin.
 *
 * Idempotência: dedupe via stripe_events.id (entrada do webhook). Eventos
 * distintos (partial refund 1, partial refund 2) são processados normalmente.
 */
async function reverseAmbassadorCommissionForRefund({
  stripeInvoiceId,
  refundedAmountBrl,
  reason,
}: {
  stripeInvoiceId: string;
  refundedAmountBrl: number;
  reason: string;
}) {
  if (refundedAmountBrl <= 0) return;

  const admin = createAdminClient();

  // 1) Acha o user_id via invoice → subscription → metadata.user_id
  const stripe = getStripe();
  let invoice: Stripe.Invoice;
  try {
    invoice = await stripe.invoices.retrieve(stripeInvoiceId);
  } catch (err) {
    console.error("[webhook] reverseCommission: invoice retrieve failed", err);
    return;
  }

  const subMeta = (
    invoice as unknown as { subscription_details?: { metadata?: { user_id?: string } } }
  ).subscription_details?.metadata;
  const referredUserId = subMeta?.user_id ?? invoice.metadata?.user_id;
  if (!referredUserId) {
    console.warn("[webhook] reverseCommission: no user_id on invoice", stripeInvoiceId);
    return;
  }

  // 2) Acha redemption desse referido
  const { data: redemption } = await admin
    .from("referral_redemptions")
    .select("id, referral_code_id, referrer_user_id")
    .eq("referred_user_id", referredUserId)
    .maybeSingle();

  if (!redemption) return; // user não veio de embaixador — nada a reverter

  const r = redemption as {
    id: string;
    referral_code_id: string;
    referrer_user_id: string;
  };

  // 3) Lê commission_rate
  const { data: code } = await admin
    .from("referral_codes")
    .select("commission_rate")
    .eq("id", r.referral_code_id)
    .maybeSingle();

  const commissionRate =
    (code as { commission_rate?: number } | null)?.commission_rate ?? 0.25;
  const reversalBrl = Math.round(refundedAmountBrl * commissionRate * 100) / 100;

  // 4) Período do mês corrente (mesmo cálculo de accrueAmbassadorCommission)
  const now = new Date();
  const periodStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  );
  const periodStartStr = periodStart.toISOString().slice(0, 10);

  // 5) Lê payout do mês corrente
  const { data: existing } = await admin
    .from("ambassador_payouts")
    .select("id, gross_revenue_brl, commission_brl, notes, status")
    .eq("referral_code_id", r.referral_code_id)
    .eq("period_start", periodStartStr)
    .maybeSingle();

  if (!existing) {
    // Refund sem payout no mês — cross-month refund. Loga pro admin reconciliar.
    console.warn(
      "[webhook] reverseCommission: no payout this month",
      { invoice: stripeInvoiceId, ambassador: r.referrer_user_id, reason },
    );
    return;
  }

  const ex = existing as {
    id: string;
    gross_revenue_brl: number;
    commission_brl: number;
    notes: string | null;
    status: string;
  };

  // 6) Se payout já foi pago (PIX já saiu), NÃO mexe no valor — só anota.
  // Lumio absorve o prejuízo desse refund. Admin decide se cobra do embaixador.
  if (ex.status === "paid") {
    const note = `[${new Date().toISOString()}] REFUND APÓS PAYOUT PAGO (${reason}): R$ ${refundedAmountBrl.toFixed(2)} refundado, comissão R$ ${reversalBrl.toFixed(2)} já foi paga ao embaixador. Reconciliar manualmente.`;
    await admin
      .from("ambassador_payouts")
      .update({
        notes: ex.notes ? `${ex.notes}\n${note}` : note,
        updated_at: new Date().toISOString(),
      })
      .eq("id", ex.id);
    return;
  }

  // 7) Decrementa, com floor em 0 (nunca negativo)
  const newGross = Math.max(0, Number(ex.gross_revenue_brl) - refundedAmountBrl);
  const newCommission = Math.max(0, Number(ex.commission_brl) - reversalBrl);

  // Se o refund excede o acumulado do mês, registra o excedente nas notes
  const grossExcess = Math.max(0, refundedAmountBrl - Number(ex.gross_revenue_brl));
  const commissionExcess = Math.max(0, reversalBrl - Number(ex.commission_brl));
  const note = `[${new Date().toISOString()}] REVERSAL (${reason}): -R$ ${refundedAmountBrl.toFixed(2)} bruto / -R$ ${reversalBrl.toFixed(2)} comissão${grossExcess > 0 ? ` (excedente R$ ${grossExcess.toFixed(2)} bruto / R$ ${commissionExcess.toFixed(2)} comissão — venda de mês anterior)` : ""}`;

  await admin
    .from("ambassador_payouts")
    .update({
      gross_revenue_brl: newGross,
      commission_brl: newCommission,
      notes: ex.notes ? `${ex.notes}\n${note}` : note,
      updated_at: new Date().toISOString(),
    })
    .eq("id", ex.id);
}

/**
 * Credita os coins do plano no momento que a subscription renova ou ativa.
 * Faz SET ABSOLUTO (não acumulativo) — reseta saldo pro pacote do plano.
 */
async function creditPlanCoins(userId: string, plan: PlanName, subId: string) {
  const monthly = PLAN_COINS_PER_MONTH[plan];
  if (!monthly) return;
  await setBalanceForRenewal(userId, monthly, {
    plan,
    stripe_subscription_id: subId,
    granted_at: new Date().toISOString(),
  });
}

async function upsertSubscriptionFromStripe(
  userId: string,
  sub: Stripe.Subscription,
  customerId: string | null | undefined,
) {
  const admin = createAdminClient();

  const price = sub.items.data[0]?.price;
  const priceId = price?.id;
  const plan = priceId && PLAN_PRICE_TO_NAME[priceId] ? PLAN_PRICE_TO_NAME[priceId] : "pro";

  // Valor real cobrado, direto do price do Stripe. Guardamos amount + interval
  // porque o mesmo `plan` cobre mensal e anual (ver migration 022).
  const amountCents = typeof price?.unit_amount === "number" ? price.unit_amount : null;
  const currency = price?.currency ?? null;
  const billingInterval = price?.recurring?.interval ?? null;

  // current_period_end existe em DOIS lugares dependendo da Stripe API version:
  // - API < 2025-03: root da Subscription
  // - API >= 2025-03: por item (sub.items.data[0].current_period_end)
  // Pegamos de ambos pra robustez (Reality Check fix #14).
  const subRoot = sub as unknown as { current_period_end?: number };
  const itemLevel = sub.items.data[0] as unknown as { current_period_end?: number };
  const periodEnd = itemLevel?.current_period_end ?? subRoot.current_period_end;

  const { error: upsertErr } = await admin.from("subscriptions").upsert(
    {
      user_id: userId,
      stripe_customer_id: customerId ?? null,
      stripe_subscription_id: sub.id,
      plan,
      status: sub.status,
      current_period_end: periodEnd
        ? new Date(periodEnd * 1000).toISOString()
        : null,
      cancel_at_period_end: sub.cancel_at_period_end,
      amount_cents: amountCents,
      currency,
      billing_interval: billingInterval,
    },
    { onConflict: "user_id" },
  );
  if (upsertErr) {
    // CRÍTICO: antes esse erro era engolido silenciosamente — coin_balance era
    // creditado mas plan/status ficavam free/inactive. Loga e re-throw pro
    // Stripe marcar como failed e re-tentar.
    console.error(
      "[webhook] upsertSubscription FAILED",
      { userId, subId: sub.id, plan, status: sub.status },
      upsertErr,
    );
    throw new Error(`subscriptions upsert failed: ${upsertErr.message}`);
  }
}

/**
 * Modelo v2 (Chagas-style): comissão recorrente baseada em commission_rate
 * do embaixador. Cada pagamento (checkout inicial + renovações) acumula
 * num ambassador_payouts mensal.
 *
 * - Acha redemption pelo referred_user_id
 * - Lê commission_rate do referral_code do embaixador
 * - Calcula commission = amountBrl * commission_rate
 * - UPSERT ambassador_payouts pra (referral_code_id, period_start=início do mês):
 *     gross_revenue_brl += amountBrl
 *     commission_brl    += commission
 * - Idempotente por chave única (referral_code_id, period_start) — migration 028
 * - Também atualiza redemption.status='paid' na 1ª venda
 *
 * Admin paga PIX manual no fim do mês via /admin/embaixadores/payouts.
 */
async function accrueAmbassadorCommission({
  referredUserId,
  amountBrl,
  plan,
}: {
  referredUserId: string;
  amountBrl: number;
  plan: PlanName;
}) {
  if (amountBrl <= 0) return;

  const admin = createAdminClient();

  // 1) Acha redemption desse referido
  const { data: redemption } = await admin
    .from("referral_redemptions")
    .select("id, status, referral_code_id, referrer_user_id")
    .eq("referred_user_id", referredUserId)
    .maybeSingle();

  if (!redemption) return; // user não veio de embaixador

  const r = redemption as {
    id: string;
    status: string;
    referral_code_id: string;
    referrer_user_id: string;
  };

  // 2) Lê commission_rate + pix_key do embaixador
  const { data: code } = await admin
    .from("referral_codes")
    .select("commission_rate, pix_key")
    .eq("id", r.referral_code_id)
    .maybeSingle();

  const commissionRate =
    (code as { commission_rate?: number } | null)?.commission_rate ?? 0.25;
  const pixKey = (code as { pix_key?: string | null } | null)?.pix_key ?? null;

  const commissionBrl = Math.round(amountBrl * commissionRate * 100) / 100;

  // 3) Período do mês corrente (UTC pra alinhar com Stripe)
  const now = new Date();
  const periodStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  );
  const periodEnd = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0),
  );
  const periodStartStr = periodStart.toISOString().slice(0, 10);
  const periodEndStr = periodEnd.toISOString().slice(0, 10);

  // 4) UPSERT: se já existe payout do mês pra esse embaixador, soma. Senão cria.
  const { data: existing } = await admin
    .from("ambassador_payouts")
    .select("id, gross_revenue_brl, commission_brl")
    .eq("referral_code_id", r.referral_code_id)
    .eq("period_start", periodStartStr)
    .maybeSingle();

  if (existing) {
    const ex = existing as {
      id: string;
      gross_revenue_brl: number;
      commission_brl: number;
    };
    const updates: Record<string, unknown> = {
      gross_revenue_brl: Number(ex.gross_revenue_brl) + amountBrl,
      commission_brl: Number(ex.commission_brl) + commissionBrl,
      commission_rate: commissionRate,
      updated_at: new Date().toISOString(),
    };
    // Só atualiza pix_key se embaixador cadastrou (NOT NULL na tabela)
    if (pixKey) updates.pix_key = pixKey;
    await admin.from("ambassador_payouts").update(updates).eq("id", ex.id);
  } else {
    await admin.from("ambassador_payouts").insert({
      referral_code_id: r.referral_code_id,
      ambassador_user_id: r.referrer_user_id,
      period_start: periodStartStr,
      period_end: periodEndStr,
      gross_revenue_brl: amountBrl,
      commission_rate: commissionRate,
      commission_brl: commissionBrl,
      pix_key: pixKey ?? "", // NOT NULL — embaixador cadastra depois
      status: "pending",
    });
  }

  // 5) Marca redemption.status='paid' na primeira venda (idempotente)
  if (r.status !== "paid") {
    await admin
      .from("referral_redemptions")
      .update({
        status: "paid",
        paid_at: new Date().toISOString(),
        plan,
        reward_brl: commissionBrl,
        metadata: { first_amount_brl: amountBrl, commission_rate: commissionRate },
      })
      .eq("id", r.id);
  }
}

/**
 * Gera magic link de acesso direto via Supabase Admin API.
 * Reality Check fix #1 — user paga, recebe email com link clicável e entra direto.
 */
async function generateMagicLink(email: string): Promise<string | undefined> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: {
        redirectTo: `${getAppUrl()}/auth/callback?next=/dashboard`,
      },
    });
    if (error) {
      console.error("[webhook] generateMagicLink failed", error);
      return undefined;
    }
    return data?.properties?.action_link;
  } catch (err) {
    console.error("[webhook] generateMagicLink threw", err);
    return undefined;
  }
}
