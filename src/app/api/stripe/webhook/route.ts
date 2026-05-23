import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe";
import { sendReceiptEmail, sendWelcomeEmail } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PLAN_PRICE_TO_NAME: Record<string, "pro" | "annual"> = (() => {
  const map: Record<string, "pro" | "annual"> = {};
  if (process.env.STRIPE_PRICE_ID_PRO) map[process.env.STRIPE_PRICE_ID_PRO] = "pro";
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

  // Idempotência — Stripe pode reentregar o mesmo evento
  const admin = createAdminClient();
  const { error: insertError } = await admin
    .from("stripe_events")
    .insert({ id: event.id, type: event.type, payload: event });

  if (insertError) {
    // Provavelmente conflito (já processado) — Stripe espera 200
    if (insertError.code === "23505") {
      return NextResponse.json({ received: true, duplicate: true });
    }
    console.error("[stripe/webhook] persist event failed", insertError);
    return new NextResponse("storage error", { status: 500 });
  }

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

    await admin
      .from("stripe_events")
      .update({ processed_at: new Date().toISOString() })
      .eq("id", event.id);

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error(`[stripe/webhook] processing failed for ${event.type}`, err);
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

    // Envia email de boas-vindas
    const { data: profile } = await admin
      .from("profiles")
      .select("email, name")
      .eq("id", userId)
      .single();

    if (profile?.email) {
      await sendWelcomeEmail({
        to: profile.email,
        name: profile.name ?? undefined,
      });
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

  // Detecta o plano pelo price do invoice line item
  const lineItem = invoice.lines?.data?.[0] as unknown as
    | { pricing?: { price_details?: { price?: string } }; price?: { id?: string } }
    | undefined;
  const priceId =
    lineItem?.pricing?.price_details?.price ?? lineItem?.price?.id ?? null;
  const plan: "pro" | "annual" =
    priceId && PLAN_PRICE_TO_NAME[priceId] ? PLAN_PRICE_TO_NAME[priceId] : "pro";

  await sendReceiptEmail({
    to: profile.email,
    name: profile.name ?? undefined,
    plan,
    amount: invoice.amount_paid,
    currency: invoice.currency,
  });
}

async function upsertSubscriptionFromStripe(
  userId: string,
  sub: Stripe.Subscription,
  customerId: string | null | undefined,
) {
  const admin = createAdminClient();

  // Mapear price ID → plan name
  const priceId = sub.items.data[0]?.price.id;
  const plan = priceId && PLAN_PRICE_TO_NAME[priceId] ? PLAN_PRICE_TO_NAME[priceId] : "pro";

  const periodEnd = (sub.items.data[0] as unknown as { current_period_end?: number })
    ?.current_period_end;

  await admin.from("subscriptions").upsert(
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
    },
    { onConflict: "user_id" },
  );
}
