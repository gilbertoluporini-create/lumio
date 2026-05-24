/**
 * Feature flags / kill-switch via `app_config` (jsonb table).
 *
 * Permite desligar features caras em emergência (TTS, Imagen) sem deploy.
 * Admin liga/desliga em `/admin/health`.
 *
 * Keys padronizadas (todas booleanas):
 *   - `features.tts.enabled`       (default: true)
 *   - `features.imagen.enabled`    (default: true)
 *   - `features.ai_generate.enabled` (default: true)
 *
 * Cache de 30s em memória pra não bater no DB a cada request.
 */

import { createAdminClient } from "./supabase/server";

export type FeatureKey =
  | "features.tts.enabled"
  | "features.imagen.enabled"
  | "features.ai_generate.enabled";

const DEFAULTS: Record<FeatureKey, boolean> = {
  "features.tts.enabled": true,
  "features.imagen.enabled": true,
  "features.ai_generate.enabled": true,
};

const CACHE_TTL_MS = 30_000;
type CacheEntry = { value: boolean; expiresAt: number };
const cache = new Map<FeatureKey, CacheEntry>();

export async function isFeatureEnabled(key: FeatureKey): Promise<boolean> {
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("app_config")
      .select("value")
      .eq("key", key)
      .maybeSingle();
    if (error || !data) {
      const def = DEFAULTS[key];
      cache.set(key, { value: def, expiresAt: Date.now() + CACHE_TTL_MS });
      return def;
    }
    const raw = (data as { value: unknown }).value;
    const value =
      typeof raw === "boolean"
        ? raw
        : typeof raw === "object" && raw !== null && "enabled" in raw
          ? Boolean((raw as { enabled: unknown }).enabled)
          : DEFAULTS[key];
    cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
    return value;
  } catch {
    return DEFAULTS[key];
  }
}

export async function setFeatureEnabled(
  key: FeatureKey,
  value: boolean,
  updatedBy?: string,
): Promise<void> {
  const admin = createAdminClient();
  await admin.from("app_config").upsert({
    key,
    value: { enabled: value } as unknown,
    updated_at: new Date().toISOString(),
    updated_by: updatedBy ?? null,
  });
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

export async function getAllFeatureFlags(): Promise<Record<FeatureKey, boolean>> {
  const out = { ...DEFAULTS };
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("app_config")
      .select("key, value")
      .in("key", Object.keys(DEFAULTS));
    for (const row of (data ?? []) as Array<{ key: FeatureKey; value: unknown }>) {
      const raw = row.value;
      const v =
        typeof raw === "boolean"
          ? raw
          : typeof raw === "object" && raw !== null && "enabled" in raw
            ? Boolean((raw as { enabled: unknown }).enabled)
            : DEFAULTS[row.key];
      out[row.key] = v;
    }
  } catch {
    /* fallback to defaults */
  }
  return out;
}

/** Helper pra montar Response 503 quando feature está desligado por admin. */
export function featureDisabledResponse(key: FeatureKey): Response {
  const label =
    key === "features.tts.enabled"
      ? "Respostas por voz"
      : key === "features.imagen.enabled"
        ? "Geração de imagens"
        : "Geração de IA";
  return Response.json(
    {
      error: `${label} temporariamente desativada para manutenção. Tente novamente em alguns minutos.`,
      code: "feature_disabled",
      feature: key,
    },
    { status: 503 },
  );
}
