import { createAdminClient } from "./supabase/server";

type PricingEntry = {
  inputPerMtok?: number;
  outputPerMtok?: number;
  perImage?: number;
};

const PRICING: Record<string, PricingEntry> = {
  "claude-sonnet-4-5-20250929": { inputPerMtok: 3, outputPerMtok: 15 },
  "claude-sonnet-4-5": { inputPerMtok: 3, outputPerMtok: 15 },
  "claude-haiku-4-5": { inputPerMtok: 1, outputPerMtok: 5 },
  "imagen-3.0-generate-002": { perImage: 0.04 },
  "imagen-3.0": { perImage: 0.04 },
};

function computeCostUsd(opts: {
  model: string;
  inputTokens: number;
  outputTokens: number;
  imagesCount: number;
}): number {
  const entry = PRICING[opts.model];
  if (!entry) return 0;
  let cost = 0;
  if (entry.inputPerMtok) {
    cost += (opts.inputTokens / 1_000_000) * entry.inputPerMtok;
  }
  if (entry.outputPerMtok) {
    cost += (opts.outputTokens / 1_000_000) * entry.outputPerMtok;
  }
  if (entry.perImage) {
    cost += opts.imagesCount * entry.perImage;
  }
  return Number(cost.toFixed(6));
}

export async function logAiUsage(params: {
  userId: string;
  endpoint: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  imagesCount?: number;
  coinsCharged?: number;
}): Promise<void> {
  const inputTokens = params.inputTokens ?? 0;
  const outputTokens = params.outputTokens ?? 0;
  const imagesCount = params.imagesCount ?? 0;
  const coinsCharged = params.coinsCharged ?? 0;

  const costUsd = computeCostUsd({
    model: params.model,
    inputTokens,
    outputTokens,
    imagesCount,
  });

  try {
    const admin = createAdminClient();
    const { error } = await admin.from("ai_usage_log").insert({
      user_id: params.userId,
      endpoint: params.endpoint,
      model: params.model,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      images_count: imagesCount,
      cost_usd: costUsd,
      coins_charged: coinsCharged,
    });
    if (error) {
      console.warn("[ai-usage] insert failed", error.message);
    }
  } catch (err) {
    console.warn("[ai-usage] log failed", err);
  }
}

export const AI_PRICING_TABLE = PRICING;
