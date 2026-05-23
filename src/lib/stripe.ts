import Stripe from "stripe";

let stripeInstance: Stripe | null = null;

export function getStripe(): Stripe {
  if (stripeInstance) return stripeInstance;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY não configurada.");
  }
  stripeInstance = new Stripe(key, {
    apiVersion: "2026-04-22.dahlia",
    typescript: true,
  });
  return stripeInstance;
}

export const PLAN_PRICE_IDS = {
  pro: process.env.STRIPE_PRICE_ID_PRO ?? "",
  annual: process.env.STRIPE_PRICE_ID_ANNUAL ?? "",
} as const;

export type PlanId = keyof typeof PLAN_PRICE_IDS;

export function isStripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

export function getPriceId(plan: PlanId): string {
  const id = PLAN_PRICE_IDS[plan];
  if (!id) throw new Error(`Price ID não configurado para plano '${plan}'.`);
  return id;
}

export function getAppUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "http://localhost:3000"
  );
}
