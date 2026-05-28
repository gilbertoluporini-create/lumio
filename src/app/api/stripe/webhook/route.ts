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

    // Programa embaixadores: se esse user foi indicado, marca redemption como paid.
    try {
      await markReferralPaid({
        referredUserId: userId,
        plan,
        amountBrl: amountTotal / 100,
      });
    } catch (err) {
      console.error("[webhook] markReferralPaid failed", err);
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
  const userId = (
    (invoice as unknown as { subscription_details?: { metadata?: { user_id?: string } } })
      .subscription_details?.metadata ??
    invoice.metadata ??
    {}
  )?.user_id;
  if (!userId) return;
  const admin = createAdminClient();
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
  const subId =
    (invoice as unknown as { subscription?: string | { id?: string } }).subscription;
  const stripeSubId = typeof subId === "string" ? subId : subId?.id ?? "renew";
  try {
    await creditPlanCoins(userId, plan, stripeSubId);
  } catch (err) {
    console.error("[webhook] creditPlanCoins on renew failed", err);
  }
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
 * Marca redemption como paid + calcula reward_brl.
 * Reward MVP: 1 mês do plano que o referido pagou (Starter=R$39, Pro=R$69, Power=R$119, Annual=R$69).
 * Lógica de APLICAR o crédito fica manual no início (admin vê fila e aciona).
 */
async function markReferralPaid({
  referredUserId,
  plan,
  amountBrl,
}: {
  referredUserId: string;
  plan: PlanName;
  amountBrl: number;
}) {
  const admin = createAdminClient();

  // Procura redemption pendente
  const { data: redemption } = await admin
    .from("referral_redemptions")
    .select("id, status, referral_code_id, referrer_user_id")
    .eq("referred_user_id", referredUserId)
    .maybeSingle();

  if (!redemption) return;
  if (redemption.status === "paid") return; // idempotente

  // Reward fixo por plano (1 mês do plano do referido, capeado em R$69)
  const rewardByPlan: Record<PlanName, number> = {
    starter: 39,
    pro: 69,
    power: 69, // cap em 1 mês Pro mesmo se ele pagou Power (ajustável depois)
    annual: 69,
  };
  const rewardBrl = rewardByPlan[plan] ?? 39;

  await admin
    .from("referral_redemptions")
    .update({
      status: "paid",
      paid_at: new Date().toISOString(),
      plan,
      reward_brl: rewardBrl,
      metadata: { paid_amount_brl: amountBrl },
    })
    .eq("id", redemption.id);
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
