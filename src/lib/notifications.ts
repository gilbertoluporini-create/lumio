/**
 * Notifications — helpers server-side pra criar notificações in-app.
 *
 * Use `notifyUser` pra notificar um user específico, ou `notifyAdmins` pra
 * disparar pra todos os emails admin (whitelist em src/lib/admin-emails.ts).
 *
 * Inserts SEMPRE via service-role (RLS bloqueia insert direto do client).
 */

import { createAdminClient } from "@/lib/supabase/server";
import { ADMIN_EMAILS } from "@/lib/admin-emails";

export type NotificationType =
  | "ticket_new"
  | "ticket_reply"
  | "ticket_status";

export type NotificationInput = {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string | null;
  href?: string | null;
  metadata?: Record<string, unknown>;
};

/**
 * Insere uma notificação pra um user específico. Falhas são logadas mas
 * NÃO quebram o caller (notificação é side-effect de UX, não crítico).
 */
export async function notifyUser(input: NotificationInput): Promise<void> {
  try {
    const admin = createAdminClient();
    const { error } = await admin.from("notifications").insert({
      user_id: input.userId,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      href: input.href ?? null,
      metadata: input.metadata ?? {},
    });
    if (error) {
      console.error("[notifications] insert failed", error);
    }
  } catch (err) {
    console.error("[notifications] notifyUser unexpected error", err);
  }
}

/**
 * Notifica TODOS os usuários admin (whitelist). Resolve email → user_id via
 * tabela profiles. Admins sem profile (não logaram ainda) são ignorados.
 */
export async function notifyAdmins(
  input: Omit<NotificationInput, "userId">,
): Promise<void> {
  try {
    const admin = createAdminClient();

    // Resolve admin emails → user_ids via profiles
    const lowered = ADMIN_EMAILS.map((e) => e.toLowerCase().trim());
    const { data: profiles, error } = await admin
      .from("profiles")
      .select("id, email")
      .in("email", lowered);

    if (error) {
      console.error("[notifications] fetch admin profiles failed", error);
      return;
    }

    const adminProfiles = (profiles ?? []) as Array<{
      id: string;
      email: string;
    }>;

    if (adminProfiles.length === 0) {
      console.warn("[notifications] no admin profiles found for", lowered);
      return;
    }

    const rows = adminProfiles.map((p) => ({
      user_id: p.id,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      href: input.href ?? null,
      metadata: input.metadata ?? {},
    }));

    const { error: insertError } = await admin
      .from("notifications")
      .insert(rows);

    if (insertError) {
      console.error("[notifications] bulk insert failed", insertError);
    }
  } catch (err) {
    console.error("[notifications] notifyAdmins unexpected error", err);
  }
}
