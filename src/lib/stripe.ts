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

// Planos com sistema de Lumio Coins
export const PLAN_PRICE_IDS = {
  starter: process.env.STRIPE_PRICE_ID_STARTER ?? "",
  pro: process.env.STRIPE_PRICE_ID_PRO ?? "",
  power: process.env.STRIPE_PRICE_ID_POWER ?? "",
  // Legacy: anual continua disponível pra subscriptions existentes
  annual: process.env.STRIPE_PRICE_ID_ANNUAL ?? "",
} as const;

// Coins entregues por mês em cada plano (v2: coins = produtos gerados)
export const PLAN_COINS_PER_MONTH = {
  starter: 200,
  pro: 500,
  power: 1500,
  annual: 500, // legacy = equivalente ao Pro
} as const;

// Limite de aulas por mês em cada plano (basais grátis: chat/slides/transcrição)
// 999 = ilimitado prático
export const PLAN_LECTURE_LIMIT = {
  free: 3,
  starter: 20,
  pro: 100,
  power: 999,
  annual: 100, // legacy
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
