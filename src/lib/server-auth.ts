import { createClient, createAdminClient } from "./supabase/server";

export type ServerSubscription = {
  user_id: string;
  plan: "free" | "pro" | "annual";
  status:
    | "inactive"
    | "active"
    | "past_due"
    | "canceled"
    | "incomplete"
    | "trialing";
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
};

/**
 * Lê assinatura ativa do user logado via service role (bypassa RLS — usado em
 * route handlers/server components).
 */
export async function getActiveSubscriptionForUser(
  userId: string,
): Promise<ServerSubscription | null> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("subscriptions")
      .select(
        "user_id, plan, status, stripe_customer_id, stripe_subscription_id, current_period_end, cancel_at_period_end",
      )
      .eq("user_id", userId)
      .maybeSingle();
    return (data ?? null) as ServerSubscription | null;
  } catch (err) {
    console.error("[server-auth] getActiveSubscription failed", err);
    return null;
  }
}

export function isPaidActive(sub: ServerSubscription | null): boolean {
  if (!sub) return false;
  if (sub.plan === "free") return false;
  return sub.status === "active" || sub.status === "trialing";
}

/**
 * Helper pra route handlers: valida user logado + subscription ativa.
 * Retorna { user, sub } se OK, ou Response 401/402 pronto pra retornar.
 */
export async function requirePaidUser(): Promise<
  | { ok: true; userId: string; sub: ServerSubscription }
  | { ok: false; response: Response }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      ok: false,
      response: new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      }),
    };
  }
  const sub = await getActiveSubscriptionForUser(user.id);
  if (!isPaidActive(sub)) {
    return {
      ok: false,
      response: new Response(
        JSON.stringify({
          error: "Assinatura necessária pra usar esse recurso.",
          upgrade: "/pricing",
        }),
        { status: 402, headers: { "content-type": "application/json" } },
      ),
    };
  }
  return { ok: true, userId: user.id, sub: sub as ServerSubscription };
}
