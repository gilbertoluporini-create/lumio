/**
 * /api/admin/marketing/inbox
 *
 * GET   → lista mensagens recebidas via webhook IG
 * PATCH → marca como lida / arquivada / draftada / respondida
 *
 * Janela 24h IG: `response_deadline` = received_at + 24h.
 *
 * Apenas admin.
 */

import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_STATUS = [
  "unread",
  "drafted",
  "replied",
  "archived",
  "expired",
] as const;

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { searchParams } = req.nextUrl;
  const status = searchParams.get("status");
  const limit = Math.min(Number(searchParams.get("limit") || 50), 200);

  const supabase = createAdminClient();
  let query = supabase
    .from("inbox_messages")
    .select("*")
    .order("received_at", { ascending: false })
    .limit(limit);

  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Conta urgentes (<6h pra deadline)
  const now = Date.now();
  let urgentCount = 0;
  let unreadCount = 0;
  for (const row of data || []) {
    if (row.status === "unread") unreadCount += 1;
    if (row.status === "unread" || row.status === "drafted") {
      const deadline = new Date(row.response_deadline).getTime();
      if (deadline - now < 6 * 60 * 60 * 1000) urgentCount += 1;
    }
  }

  return NextResponse.json({
    messages: data || [],
    counts: { unread: unreadCount, urgent: urgentCount },
  });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null);
  if (!body?.id) {
    return NextResponse.json({ error: "id obrigatório" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};

  if (body.status) {
    if (!ALLOWED_STATUS.includes(body.status)) {
      return NextResponse.json({ error: "status inválido" }, { status: 400 });
    }
    updates.status = body.status;
    if (body.status === "replied") updates.replied_at = new Date().toISOString();
  }

  if (typeof body.reply_draft === "string") updates.reply_draft = body.reply_draft;
  if (typeof body.reply_text === "string") updates.reply_text = body.reply_text;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "nada pra atualizar" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("inbox_messages")
    .update(updates)
    .eq("id", body.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ message: data });
}
