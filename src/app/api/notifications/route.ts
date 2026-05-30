import { NextResponse, type NextRequest } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type NotificationRow = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  href: string | null;
  metadata: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
};

/**
 * GET /api/notifications
 *   ?limit=20  (default 20, max 100)
 *   ?unread=1  (apenas não lidas)
 *
 * Retorna { notifications, unreadCount }.
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const limit = Math.min(
    Math.max(parseInt(url.searchParams.get("limit") ?? "20", 10) || 20, 1),
    100,
  );
  const unreadOnly = url.searchParams.get("unread") === "1";

  const admin = createAdminClient();

  let query = admin
    .from("notifications")
    .select("id, type, title, body, href, metadata, read_at, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (unreadOnly) {
    query = query.is("read_at", null);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Conta total não lidas (separado do limit pra mostrar badge correto)
  const { count: unreadCount, error: countError } = await admin
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .is("read_at", null);

  if (countError) {
    console.error("[notifications] unread count failed", countError);
  }

  return NextResponse.json({
    notifications: (data ?? []) as NotificationRow[],
    unreadCount: unreadCount ?? 0,
  });
}

/**
 * POST /api/notifications  { action: 'read_all' }
 * Marca todas as notificações do user como lidas.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { action?: string } = {};
  try {
    body = (await req.json()) as { action?: string };
  } catch {
    // body opcional
  }

  if (body.action !== "read_all") {
    return NextResponse.json(
      { error: "Ação inválida. Use { action: 'read_all' }." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const now = new Date().toISOString();
  const { error } = await admin
    .from("notifications")
    .update({ read_at: now })
    .eq("user_id", user.id)
    .is("read_at", null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
