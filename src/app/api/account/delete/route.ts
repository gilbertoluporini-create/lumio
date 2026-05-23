import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { getStripe, isStripeConfigured } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  confirm: z.string(),
});

export async function POST(req: Request) {
  let parsed: z.infer<typeof Body>;
  try {
    parsed = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  }

  if (parsed.confirm.trim().toLowerCase() !== "excluir") {
    return NextResponse.json(
      { error: 'Confirme digitando "EXCLUIR".' },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const admin = createAdminClient();

  // Cancela subscription ativa no Stripe pra não cobrar mais
  if (isStripeConfigured()) {
    try {
      const { data: sub } = await admin
        .from("subscriptions")
        .select("stripe_subscription_id, stripe_customer_id, status")
        .eq("user_id", user.id)
        .maybeSingle();

      const stripe = getStripe();

      if (sub?.stripe_subscription_id && sub.status !== "canceled") {
        await stripe.subscriptions.cancel(sub.stripe_subscription_id).catch((e) => {
          console.warn("[account/delete] cancel subscription:", e);
        });
      }
      if (sub?.stripe_customer_id) {
        await stripe.customers.del(sub.stripe_customer_id).catch((e) => {
          console.warn("[account/delete] delete customer:", e);
        });
      }
    } catch (e) {
      console.error("[account/delete] stripe cleanup:", e);
      // não bloqueia exclusão — admin pode limpar Stripe manualmente depois
    }
  }

  // Apaga user do auth — cascateia profile, subjects, lectures, coins, assets
  const { error: deleteErr } = await admin.auth.admin.deleteUser(user.id);
  if (deleteErr) {
    console.error("[account/delete] auth deleteUser:", deleteErr);
    return NextResponse.json(
      { error: "Não foi possível excluir a conta. Tenta de novo." },
      { status: 500 },
    );
  }

  // Faz signOut da session local
  await supabase.auth.signOut().catch(() => {});

  return NextResponse.json({ ok: true });
}
