import Stripe from "stripe";

let stripeInstance: Stripe | null = null;

export function getStripe(): Stripe {
  if (stripeInstance) return stripeInstance;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY não configurada.");
  }
  stripeInstance = new Stripe(key, {
    apiVersion: "2026-05-27.dahlia",
    typescript: true,
  });
  return stripeInstance;
}

export const PLAN_PRICE_IDS = {
  starter: {
    monthly: process.env.STRIPE_PRICE_ID_STARTER ?? "",
    annual: process.env.STRIPE_PRICE_ID_STARTER_ANNUAL ?? "",
  },
  pro: {
    monthly: process.env.STRIPE_PRICE_ID_PRO ?? "",
    annual: process.env.STRIPE_PRICE_ID_PRO_ANNUAL ?? "",
  },
  power: {
    monthly: process.env.STRIPE_PRICE_ID_POWER ?? "",
    annual: process.env.STRIPE_PRICE_ID_POWER_ANNUAL ?? "",
  },
  annual: {
    monthly: process.env.STRIPE_PRICE_ID_ANNUAL ?? "",
    annual: process.env.STRIPE_PRICE_ID_ANNUAL ?? "",
  },
} as const;

export const PLAN_PRICES_BRL = {
  starter: { monthly: 39, annual: 390 },
  pro: { monthly: 69, annual: 690 },
  power: { monthly: 119, annual: 1190 },
} as const;

export const PLAN_COINS_PER_MONTH = {
  starter: 200,
  pro: 500,
  power: 1500,
  annual: 500,
} as const;

export const PLAN_LECTURE_LIMIT = {
  free: 3,
  starter: 20,
  pro: 100,
  power: 999,
  annual: 100,
} as const;

export type PlanId = keyof typeof PLAN_PRICE_IDS;
export type BillingInterval = "monthly" | "annual";
export type PaidPlanId = "starter" | "pro" | "power";

export function isStripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

export function getPriceId(plan: PlanId, interval: BillingInterval = "monthly"): string {
  const entry = PLAN_PRICE_IDS[plan];
  const id = entry?.[interval];
  if (!id) {
    throw new Error(`Price ID não configurado para '${plan}' (${interval}).`);
  }
  return id;
}

export function getAppUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "http://localhost:3000"
  );
}
