/**
 * Admin helpers — central de checagem de permissão administrativa.
 *
 * Regra: admin é definido por email (whitelist). Service-role do Supabase
 * NUNCA chega no client. Toda operação privilegiada passa pelas rotas
 * /api/admin/* que chamam `requireAdmin()` antes de qualquer side effect.
 */

import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "./supabase/server";
import { isAdminEmail, ADMIN_EMAILS } from "./admin-emails";

// Re-export pra manter retrocompatibilidade com imports existentes (todos
// os route handlers e o /admin/layout.tsx importam daqui).
export { isAdminEmail, ADMIN_EMAILS };

export type AdminUser = {
  id: string;
  email: string;
};

export type RequireAdminResult =
  | { ok: true; admin: AdminUser }
  | { ok: false; response: NextResponse };

/**
 * Server-side guard pra route handlers em /api/admin/*.
 * Retorna admin info se ok, ou Response 401/403 pronto pra retornar.
 */
export async function requireAdmin(): Promise<RequireAdminResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  if (!isAdminEmail(user.email)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Forbidden — admin only." },
        { status: 403 },
      ),
    };
  }

  return {
    ok: true,
    admin: { id: user.id, email: user.email ?? "" },
  };
}

/**
 * Log de ação administrativa pra audit trail.
 * Falhas são logadas mas não bloqueiam o caller.
 */
export async function logAdminAction(opts: {
  adminEmail: string;
  action: string;
  targetUserId?: string | null;
  targetUserEmail?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin.from("admin_actions").insert({
      admin_email: opts.adminEmail,
      action: opts.action,
      target_user_id: opts.targetUserId ?? null,
      target_user_email: opts.targetUserEmail ?? null,
      metadata: opts.metadata ?? null,
    });
  } catch (err) {
    console.error("[admin] logAdminAction failed", err);
  }
}
