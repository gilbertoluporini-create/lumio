/**
 * POST /api/support/tickets/[id]/user-reply
 *
 * Endpoint pro PRÓPRIO autor do ticket reagir à resposta do admin:
 *  - `resolved: true`  → marca ticket como resolved + grava user_followup_message
 *                        opcional. Não notifica admin de novo.
 *  - `resolved: false` → reabre o ticket (status="open"), grava follow-up
 *                        do user, dispara notificação pro admin.
 *
 * Não tem polimorfismo: 1 round-trip user→admin→user→admin é o limite.
 * Se precisar de thread longa, refatorar pra tabela support_ticket_messages.
 */

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { notifyAdmins } from "@/lib/notifications";

const PayloadSchema = z.object({
  resolved: z.boolean(),
  message: z.string().max(2000).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }
  const parsed = PayloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Payload inválido.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  // Confirma que o ticket pertence ao user (anti-leak)
  const { data: ticket, error: tErr } = await admin
    .from("support_tickets")
    .select(
      "id, user_id, subject, admin_reply, replied_at, status, user_resolved",
    )
    .eq("id", id)
    .single();

  if (tErr || !ticket) {
    return NextResponse.json(
      { error: "Ticket não encontrado." },
      { status: 404 },
    );
  }
  if (ticket.user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!ticket.admin_reply) {
    return NextResponse.json(
      { error: "Admin ainda não respondeu este ticket." },
      { status: 400 },
    );
  }

  const now = new Date().toISOString();
  const update: Record<string, unknown> = {
    user_resolved: parsed.data.resolved,
    user_followup_at: now,
    updated_at: now,
  };
  if (parsed.data.message?.trim()) {
    update.user_followup_message = parsed.data.message.trim();
  }
  if (parsed.data.resolved) {
    update.status = "resolved";
    update.resolved_at = now;
  } else {
    // Reabre — admin precisa olhar de novo
    update.status = "open";
  }

  const { error: updErr } = await admin
    .from("support_tickets")
    .update(update)
    .eq("id", id);
  if (updErr) {
    console.error("[user-reply] update failed", updErr);
    return NextResponse.json({ error: "Falha ao atualizar." }, { status: 500 });
  }

  // Notifica admin só se NÃO resolveu (reabre)
  if (!parsed.data.resolved) {
    try {
      await notifyAdmins({
        type: "ticket_new",
        title: `Ticket reaberto: ${ticket.subject ?? ""}`,
        body:
          parsed.data.message?.slice(0, 200) ??
          "Usuário marcou como não resolvido.",
        href: `/admin/tickets`,
        metadata: { ticketId: id, reopen: true },
      });
    } catch (err) {
      console.error("[user-reply] notify admin failed", err);
    }
  }

  return NextResponse.json({ ok: true, resolved: parsed.data.resolved });
}
