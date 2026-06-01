/**
 * /api/notifications/subscribe
 *
 * POST   — Registra (ou atualiza) a push subscription do device atual do user.
 * DELETE — Remove a sub do device (unsubscribe).
 *
 * O endpoint persiste em `public.push_subscriptions` (migration 040).
 * A constraint UNIQUE (user_id, endpoint) garante idempotência — upsert por
 * (user_id, endpoint).
 */
import { NextResponse, type NextRequest } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SubscribeBody = {
  endpoint?: string;
  p256dh?: string;
  auth_key?: string;
  user_agent?: string;
};

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: SubscribeBody;
  try {
    body = (await req.json()) as SubscribeBody;
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const endpoint = (body.endpoint ?? "").trim();
  const p256dh = (body.p256dh ?? "").trim();
  const authKey = (body.auth_key ?? "").trim();
  const userAgent =
    (body.user_agent ?? req.headers.get("user-agent") ?? "").slice(0, 500) ||
    null;

  if (!endpoint || !p256dh || !authKey) {
    return NextResponse.json(
      { error: "Campos obrigatórios: endpoint, p256dh, auth_key." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  // Upsert por (user_id, endpoint). last_active_at atualiza a cada novo register.
  const { error } = await admin
    .from("push_subscriptions")
    .upsert(
      {
        user_id: user.id,
        endpoint,
        p256dh,
        auth_key: authKey,
        user_agent: userAgent,
        last_active_at: new Date().toISOString(),
      },
      { onConflict: "user_id,endpoint" },
    );

  if (error) {
    console.error("[notifications/subscribe] upsert failed", error);
    return NextResponse.json(
      { error: "Falha ao salvar inscrição." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { endpoint?: string };
  try {
    body = (await req.json()) as { endpoint?: string };
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const endpoint = (body.endpoint ?? "").trim();
  if (!endpoint) {
    return NextResponse.json(
      { error: "Campo obrigatório: endpoint." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("push_subscriptions")
    .delete()
    .eq("user_id", user.id)
    .eq("endpoint", endpoint);

  if (error) {
    console.error("[notifications/subscribe] delete failed", error);
    return NextResponse.json(
      { error: "Falha ao remover inscrição." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
