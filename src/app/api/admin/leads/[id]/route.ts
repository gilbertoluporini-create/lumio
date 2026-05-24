import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { Resend } from "resend";
import { createAdminClient } from "@/lib/supabase/server";
import { requireAdmin, logAdminAction } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PatchSchema = z.object({
  status: z.enum(["new", "contacted", "qualified", "converted", "lost"]).optional(),
  score: z.number().int().min(0).max(100).optional(),
  notes: z.string().trim().max(2000).optional().nullable(),
  name: z.string().trim().max(200).optional().nullable(),
  phone: z.string().trim().max(40).optional().nullable(),
  invite_to_beta: z.boolean().optional(),
});

type LeadRow = {
  id: string;
  email: string;
  name: string | null;
  status: string;
};

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const { id } = await params;

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

  const { data: existing } = await admin
    .from("leads")
    .select("id, email, name, status")
    .eq("id", id)
    .maybeSingle();
  if (!existing) {
    return NextResponse.json({ error: "Lead não encontrado." }, { status: 404 });
  }
  const lead = existing as LeadRow;

  const { invite_to_beta, ...updateFields } = parsed.data;
  const hasUpdate = Object.keys(updateFields).length > 0;

  if (hasUpdate) {
    const { error } = await admin
      .from("leads")
      .update(updateFields)
      .eq("id", id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    await logAdminAction({
      adminEmail: guard.admin.email,
      action: "lead_update",
      metadata: { lead_id: id, fields: Object.keys(updateFields) },
    });
  }

  let invite_result: { sent: boolean; reason?: string } = { sent: false };
  if (invite_to_beta) {
    invite_result = await sendBetaInvite(lead);
    if (invite_result.sent) {
      await admin
        .from("leads")
        .update({ status: "contacted" })
        .eq("id", id);
      await logAdminAction({
        adminEmail: guard.admin.email,
        action: "lead_invite_beta",
        metadata: { lead_id: id, email: lead.email },
      });
    }
  }

  const { data: updated } = await admin
    .from("leads")
    .select("id, name, email, phone, source, status, score, notes, metadata, created_at, updated_at")
    .eq("id", id)
    .maybeSingle();

  return NextResponse.json({ ok: true, lead: updated, invite: invite_result });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const { id } = await params;

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("leads")
    .select("id, email")
    .eq("id", id)
    .maybeSingle();
  if (!existing) {
    return NextResponse.json({ error: "Lead não encontrado." }, { status: 404 });
  }

  const { error } = await admin.from("leads").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logAdminAction({
    adminEmail: guard.admin.email,
    action: "lead_delete",
    metadata: { lead_id: id, email: (existing as { email: string }).email },
  });

  return NextResponse.json({ ok: true });
}

async function sendBetaInvite(lead: LeadRow): Promise<{ sent: boolean; reason?: string }> {
  if (!process.env.RESEND_API_KEY) {
    return { sent: false, reason: "resend_not_configured" };
  }
  const from = process.env.RESEND_FROM_EMAIL || "Lumio <onboarding@resend.dev>";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "https://lumioapp.net";
  const firstName = (lead.name ?? "").split(" ")[0] || "estudante";
  const html = `<!doctype html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;padding:32px;color:#18181b;">
  <h1 style="font-size:24px;margin:0 0 16px;">Você foi convidado pro Lumio, ${escapeHtml(firstName)}</h1>
  <p style="line-height:1.6;color:#52525b;">Notamos seu interesse no Lumio e queremos te dar acesso antecipado. Crie sua conta abaixo:</p>
  <p style="margin:24px 0;">
    <a href="${appUrl}/signup?ref=beta-invite" style="display:inline-block;background:linear-gradient(135deg,#6366f1,#a855f7);color:white;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;">Entrar no beta</a>
  </p>
  <p style="line-height:1.6;color:#52525b;font-size:14px;">Qualquer dúvida, é só responder esse email.</p>
  <hr style="border:none;border-top:1px solid #e4e4e7;margin:32px 0;">
  <p style="font-size:12px;color:#a1a1aa;">Lumio · Transcrição de aulas + IA</p>
</body></html>`;

  try {
    const client = new Resend(process.env.RESEND_API_KEY);
    await client.emails.send({
      from,
      to: lead.email,
      subject: "Seu convite para o Lumio beta ✨",
      html,
    });
    return { sent: true };
  } catch (err) {
    console.error("[admin/leads/invite] resend failed", err);
    return { sent: false, reason: err instanceof Error ? err.message : "unknown" };
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
