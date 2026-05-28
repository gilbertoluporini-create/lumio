import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/server";
import { requireAdmin, logAdminAction } from "@/lib/admin";
import { chargeCoins, creditCoins, getBalance } from "@/lib/coins";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PatchSchema = z
  .object({
    action: z.enum([
      "reset_password",
      "set_temp_password",
      "grant_coins",
      "deduct_coins",
      "ban",
      "unban",
      "set_ambassador",
    ]),
    amount: z.number().int().positive().max(100000).optional(),
    reason: z.string().trim().max(500).optional(),
    durationHours: z.number().int().positive().max(24 * 365 * 100).optional(),
    value: z.boolean().optional(),
  })
  .refine(
    (v) => {
      if (v.action === "grant_coins" || v.action === "deduct_coins") {
        return typeof v.amount === "number" && v.amount > 0;
      }
      return true;
    },
    { message: "Amount obrigatório pra grant/deduct coins." },
  );

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const { userId } = await params;

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select(
      "id, email, name, role, onboarded_at, created_at, coin_balance, is_ambassador, subscriptions(plan, status, current_period_end, cancel_at_period_end, stripe_customer_id, stripe_subscription_id)",
    )
    .eq("id", userId)
    .maybeSingle();

  if (!profile) {
    return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });
  }

  let authMeta: {
    banned_until: string | null;
    last_sign_in_at: string | null;
    email_confirmed_at: string | null;
  } = { banned_until: null, last_sign_in_at: null, email_confirmed_at: null };
  try {
    const { data: authData } = await admin.auth.admin.getUserById(userId);
    const u = (authData as { user?: Record<string, unknown> } | null)?.user;
    if (u) {
      authMeta = {
        banned_until: (u.banned_until as string | null) ?? null,
        last_sign_in_at: (u.last_sign_in_at as string | null) ?? null,
        email_confirmed_at: (u.email_confirmed_at as string | null) ?? null,
      };
    }
  } catch (err) {
    console.error("[admin/users/:id] getUserById failed", err);
  }

  const { count: lectureCount } = await admin
    .from("lectures")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  const { data: txs } = await admin
    .from("coin_transactions")
    .select("id, amount, reason, balance_after, metadata, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(20);

  return NextResponse.json({
    profile,
    auth: authMeta,
    lecture_count: lectureCount ?? 0,
    recent_transactions: txs ?? [],
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const { userId } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Dados inválidos." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("email, name")
    .eq("id", userId)
    .maybeSingle();
  if (!profile) {
    return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });
  }
  const targetEmail = (profile as { email: string; name: string | null })
    .email;

  const { action } = parsed.data;

  try {
    if (action === "reset_password") {
      const appUrl =
        process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ??
        "https://lumioapp.net";
      const { data, error } = await admin.auth.admin.generateLink({
        type: "recovery",
        email: targetEmail,
        options: { redirectTo: `${appUrl}/auth/callback?next=/account/settings` },
      });
      if (error) throw new Error(error.message);
      await logAdminAction({
        adminEmail: guard.admin.email,
        action: "reset_password",
        targetUserId: userId,
        targetUserEmail: targetEmail,
      });
      const linkPayload = data as {
        properties?: { action_link?: string };
        action_link?: string;
      } | null;
      return NextResponse.json({
        ok: true,
        message: "Email de reset enviado.",
        recoveryLink:
          linkPayload?.properties?.action_link ??
          linkPayload?.action_link ??
          null,
      });
    }

    if (action === "set_temp_password") {
      const tempPwd = generateTempPassword();
      const { error } = await admin.auth.admin.updateUserById(userId, {
        password: tempPwd,
      });
      if (error) throw new Error(error.message);
      await logAdminAction({
        adminEmail: guard.admin.email,
        action: "set_temp_password",
        targetUserId: userId,
        targetUserEmail: targetEmail,
      });
      return NextResponse.json({
        ok: true,
        temp_password: tempPwd,
        message: "Senha temporária gerada. Copie e envie ao usuário agora — ela não será exibida novamente.",
      });
    }

    if (action === "grant_coins") {
      const amount = parsed.data.amount ?? 0;
      const result = await creditCoins(userId, amount, "admin_grant", {
        admin_email: guard.admin.email,
        reason: parsed.data.reason ?? null,
      });
      await logAdminAction({
        adminEmail: guard.admin.email,
        action: "grant_coins",
        targetUserId: userId,
        targetUserEmail: targetEmail,
        metadata: { amount, reason: parsed.data.reason ?? null },
      });
      return NextResponse.json({
        ok: true,
        new_balance: result.balanceAfter,
      });
    }

    if (action === "deduct_coins") {
      const amount = parsed.data.amount ?? 0;
      const balance = await getBalance(userId);
      const charge = await chargeCoins(userId, amount, "refund", {
        admin_email: guard.admin.email,
        reason: parsed.data.reason ?? "manual_deduct",
        was_balance: balance,
      });
      if (!charge.ok) {
        return NextResponse.json(
          { error: "Saldo insuficiente.", balance: charge.balance },
          { status: 400 },
        );
      }
      await logAdminAction({
        adminEmail: guard.admin.email,
        action: "deduct_coins",
        targetUserId: userId,
        targetUserEmail: targetEmail,
        metadata: { amount, reason: parsed.data.reason ?? null },
      });
      return NextResponse.json({
        ok: true,
        new_balance: charge.balanceAfter,
      });
    }

    if (action === "ban") {
      const hours = parsed.data.durationHours ?? 24 * 365 * 100; // ~100 anos = permanente
      const banDuration = `${hours}h`;
      const { error } = await admin.auth.admin.updateUserById(userId, {
        // Supabase aceita ban_duration como string "Xh" ou "none"
        ban_duration: banDuration,
      } as { ban_duration: string });
      if (error) throw new Error(error.message);
      await logAdminAction({
        adminEmail: guard.admin.email,
        action: "ban",
        targetUserId: userId,
        targetUserEmail: targetEmail,
        metadata: { hours, reason: parsed.data.reason ?? null },
      });
      return NextResponse.json({ ok: true, banned_for_hours: hours });
    }

    if (action === "unban") {
      const { error } = await admin.auth.admin.updateUserById(userId, {
        ban_duration: "none",
      } as { ban_duration: string });
      if (error) throw new Error(error.message);
      await logAdminAction({
        adminEmail: guard.admin.email,
        action: "unban",
        targetUserId: userId,
        targetUserEmail: targetEmail,
      });
      return NextResponse.json({ ok: true });
    }

    if (action === "set_ambassador") {
      const value = parsed.data.value ?? false;
      const { error } = await admin
        .from("profiles")
        .update({ is_ambassador: value })
        .eq("id", userId);
      if (error) throw new Error(error.message);
      await logAdminAction({
        adminEmail: guard.admin.email,
        action: "set_ambassador",
        targetUserId: userId,
        targetUserEmail: targetEmail,
        metadata: { value },
      });
      return NextResponse.json({
        ok: true,
        is_ambassador: value,
        message: value
          ? "Marcado como embaixador."
          : "Removido de embaixador.",
      });
    }

    return NextResponse.json({ error: "Ação desconhecida." }, { status: 400 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    console.error(`[admin/users/${userId}] action=${action} failed`, err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const { userId } = await params;

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("email")
    .eq("id", userId)
    .maybeSingle();
  if (!profile) {
    return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });
  }
  const targetEmail = (profile as { email: string }).email;

  // Tenta cancelar subscription Stripe se houver (best-effort)
  try {
    const { data: sub } = await admin
      .from("subscriptions")
      .select("stripe_subscription_id")
      .eq("user_id", userId)
      .maybeSingle();
    const subRow = sub as { stripe_subscription_id: string | null } | null;
    if (subRow?.stripe_subscription_id) {
      const { getStripe, isStripeConfigured } = await import("@/lib/stripe");
      if (isStripeConfigured()) {
        try {
          await getStripe().subscriptions.cancel(subRow.stripe_subscription_id);
        } catch (err) {
          console.warn("[admin/users] stripe cancel failed", err);
        }
      }
    }
  } catch (err) {
    console.warn("[admin/users] subscription lookup failed", err);
  }

  // Deleta user via Auth admin (cascade: profile, lectures, etc dependendo das FKs)
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logAdminAction({
    adminEmail: guard.admin.email,
    action: "delete_user",
    targetUserId: userId,
    targetUserEmail: targetEmail,
  });

  return NextResponse.json({ ok: true });
}

function generateTempPassword(length: number = 14): string {
  const chars =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%&*";
  let out = "";
  const arr = new Uint8Array(length);
  crypto.getRandomValues(arr);
  for (let i = 0; i < length; i++) {
    out += chars[arr[i] % chars.length];
  }
  return out;
}
