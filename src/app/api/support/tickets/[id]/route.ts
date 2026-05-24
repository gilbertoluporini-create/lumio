import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/server";
import { requireAdmin, logAdminAction } from "@/lib/admin";
import { sendSupportTicketReply } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUSES = ["open", "in_progress", "resolved", "closed"] as const;
const PRIORITIES = ["low", "normal", "high"] as const;

const PatchSchema = z
  .object({
    status: z.enum(STATUSES).optional(),
    priority: z.enum(PRIORITIES).optional(),
    reply: z.string().trim().min(1).max(5000).optional(),
  })
  .refine((v) => v.status || v.priority || v.reply, {
    message: "Informe pelo menos um campo (status, priority ou reply).",
  });

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "ID ausente." }, { status: 400 });
  }

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

  const { data: existing, error: readErr } = await admin
    .from("support_tickets")
    .select("id, user_email, user_name, subject, status")
    .eq("id", id)
    .maybeSingle();
  if (readErr || !existing) {
    return NextResponse.json({ error: "Ticket não encontrado." }, { status: 404 });
  }
  const ticket = existing as {
    id: string;
    user_email: string;
    user_name: string | null;
    subject: string;
    status: string;
  };

  const update: Record<string, unknown> = {};
  const now = new Date().toISOString();

  if (parsed.data.status) {
    update.status = parsed.data.status;
    if (parsed.data.status === "resolved" || parsed.data.status === "closed") {
      update.resolved_at = now;
    }
  }
  if (parsed.data.priority) {
    update.priority = parsed.data.priority;
  }
  if (parsed.data.reply) {
    update.admin_reply = parsed.data.reply;
    update.replied_at = now;
    // Se houver reply mas status segue 'open', mover pra in_progress
    if (!parsed.data.status && ticket.status === "open") {
      update.status = "in_progress";
    }
  }

  const { error: updErr } = await admin
    .from("support_tickets")
    .update(update)
    .eq("id", id);

  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  // Dispara email pro user se foi reply
  if (parsed.data.reply && ticket.user_email) {
    try {
      await sendSupportTicketReply({
        to: ticket.user_email,
        userName: ticket.user_name,
        ticketSubject: ticket.subject,
        reply: parsed.data.reply,
      });
    } catch (err) {
      console.error("[support] reply email failed", err);
    }
  }

  await logAdminAction({
    adminEmail: guard.admin.email,
    action: parsed.data.reply ? "ticket_reply" : "ticket_update",
    targetUserEmail: ticket.user_email,
    metadata: {
      ticketId: id,
      changes: parsed.data,
    },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "ID ausente." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("support_tickets")
    .select("user_email")
    .eq("id", id)
    .maybeSingle();
  const ticket = existing as { user_email: string } | null;

  const { error } = await admin.from("support_tickets").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logAdminAction({
    adminEmail: guard.admin.email,
    action: "ticket_delete",
    targetUserEmail: ticket?.user_email ?? null,
    metadata: { ticketId: id },
  });

  return NextResponse.json({ ok: true });
}
