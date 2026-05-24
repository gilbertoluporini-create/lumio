/**
 * GET  /api/admin/feature-flags          → lista todas as flags + valores atuais
 * POST /api/admin/feature-flags          → { key: FeatureKey, enabled: boolean }
 *                                          atualiza uma flag (kill-switch).
 *
 * Audit log em admin_actions. Apenas emails admin whitelisted.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin, logAdminAction } from "@/lib/admin";
import {
  getAllFeatureFlags,
  setFeatureEnabled,
  type FeatureKey,
} from "@/lib/feature-flags";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FEATURE_KEYS: FeatureKey[] = [
  "features.tts.enabled",
  "features.imagen.enabled",
  "features.ai_generate.enabled",
];

const Body = z.object({
  key: z.enum(FEATURE_KEYS as [FeatureKey, ...FeatureKey[]]),
  enabled: z.boolean(),
});

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const flags = await getAllFeatureFlags();
  return NextResponse.json({ flags });
}

export async function POST(req: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  let parsed: z.infer<typeof Body>;
  try {
    parsed = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Body inválido." }, { status: 400 });
  }

  await setFeatureEnabled(parsed.key, parsed.enabled, guard.admin.email);
  await logAdminAction({
    adminEmail: guard.admin.email,
    action: parsed.enabled ? "feature_enabled" : "feature_disabled",
    metadata: { key: parsed.key, enabled: parsed.enabled },
  });

  return NextResponse.json({ ok: true, key: parsed.key, enabled: parsed.enabled });
}
