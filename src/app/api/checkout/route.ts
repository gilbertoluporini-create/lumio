import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getAppUrl, getPriceId, getStripe, isStripeConfigured } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  plan: z.enum(["starter", "pro", "power", "annual"]),
});

export async function POST(req: Request) {
  if (!isStripeConfigured()) {
    return NextResponse.json(
      { error: "Stripe ainda não configurado." },
      { status: 503 },
    );
  }

  let parsed: z.infer<typeof Body>;
  try {
    parsed = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Plano inválido." }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Faça login antes de comprar." }, { status: 401 });
  }

  const stripe = getStripe();
  const appUrl = getAppUrl();
  const priceId = getPriceId(parsed.plan);

  // Verifica se já há um customer ID associado ao user
  const { data: subData } = await supabase
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .maybeSingle();

  const sub = subData as { stripe_customer_id: string | null } | null;
  let customer = sub?.stripe_customer_id ?? undefined;
  if (!customer) {
    const created = await stripe.customers.create({
      email: user.email,
      metadata: { user_id: user.id },
    });
    customer = created.id;
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer,
    line_items: [{ price: priceId, quantity: 1 }],
    client_reference_id: user.id,
    metadata: { user_id: user.id, plan: parsed.plan },
    subscription_data: {
      metadata: { user_id: user.id, plan: parsed.plan },
    },
    payment_method_types: ["card"],
    locale: "pt-BR",
    allow_promotion_codes: true,
    success_url: `${appUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/pricing?canceled=1`,
    billing_address_collection: "auto",
  });

  return NextResponse.json({ url: session.url });
}
