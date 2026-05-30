import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/admin";
import { sendSupportTicketNotification } from "@/lib/email";
import { notifyAdmins } from "@/lib/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CATEGORIES = ["duvida", "bug", "sugestao", "cobranca", "outro"] as const;
const STATUSES = ["open", "in_progress", "resolved", "closed"] as const;

const CreateTicketSchema = z.object({
  subject: z.string().trim().min(3, "Assunto curto demais").max(200),
  category: z.enum(CATEGORIES).default("duvida"),
  message: z.string().trim().min(20, "Conte um pouco mais (mín. 20 caracteres)").max(5000),
  name: z.string().trim().max(200).optional(),
});

type SupportTicketRow = {
  id: string;
  user_id: string | null;
  user_email: string;
  user_name: string | null;
  subject: string;
  category: string;
  message: string;
  status: string;
  priority: string;
  admin_reply: string | null;
  replied_at: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
};

export async function POST(req: NextRequest) {
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

  const parsed = CreateTicketSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return NextResponse.json(
      { error: first?.message ?? "Dados inválidos.", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const userEmail = user.email ?? "";

  const { data: profile } = await admin
    .from("profiles")
    .select("name, email")
    .eq("id", user.id)
    .maybeSingle();
  const profileRow = profile as { name: string | null; email: string } | null;

  const ticketName =
    parsed.data.name?.trim() || profileRow?.name?.trim() || null;

  const { data, error } = await admin
    .from("support_tickets")
    .insert({
      user_id: user.id,
      user_email: userEmail || profileRow?.email || "",
      user_name: ticketName,
      subject: parsed.data.subject,
      category: parsed.data.category,
      message: parsed.data.message,
      status: "open",
      priority: "normal",
    })
    .select("id, created_at")
    .single();

  if (error || !data) {
    console.error("[support] insert ticket failed", error);
    return NextResponse.json(
      { error: "Não conseguimos abrir o ticket. Tente novamente em alguns instantes." },
      { status: 500 },
    );
  }

  const row = data as { id: string; created_at: string };

  // Dispara email pro admin (best-effort, não bloqueia resposta se falhar)
  try {
    const adminEmail =
      process.env.ADMIN_NOTIFICATION_EMAIL || "contato@lumioapp.net";
    await sendSupportTicketNotification({
      to: adminEmail,
      ticketId: row.id,
      userName: ticketName ?? "",
      userEmail: userEmail || profileRow?.email || "",
      subject: parsed.data.subject,
      category: parsed.data.category,
      message: parsed.data.message,
    });
  } catch (err) {
    console.error("[support] notification email failed", err);
  }

  // Notificação in-app pros admins (sininho)
  await notifyAdmins({
    type: "ticket_new",
    title: `Novo ticket: ${parsed.data.subject}`,
    body: `${ticketName ?? userEmail} · ${parsed.data.category}`,
    href: "/admin/tickets",
    metadata: { ticketId: row.id, category: parsed.data.category },
  });

  return NextResponse.json({
    ok: true,
    ticketId: row.id,
    createdAt: row.created_at,
  });
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const url = new URL(req.url);
  const isAdmin = isAdminEmail(user.email);

  // Non-admin: lista próprios tickets
  if (!isAdmin) {
    const { data, error } = await admin
      .from("support_tickets")
      .select(
        "id, subject, category, status, priority, admin_reply, replied_at, created_at, updated_at",
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ tickets: data ?? [] });
  }

  // Admin: lista todos com filtros
  const statusFilter = url.searchParams.get("status");
  const search = url.searchParams.get("q");
  const limit = Math.min(
    Math.max(parseInt(url.searchParams.get("limit") ?? "100", 10) || 100, 1),
    500,
  );

  let query = admin
    .from("support_tickets")
    .select(
      "id, user_id, user_email, user_name, subject, category, message, status, priority, admin_reply, replied_at, resolved_at, created_at, updated_at",
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (statusFilter && STATUSES.includes(statusFilter as typeof STATUSES[number])) {
    query = query.eq("status", statusFilter);
  }
  if (search && search.trim()) {
    const term = `%${search.trim()}%`;
    query = query.or(
      `subject.ilike.${term},user_email.ilike.${term},user_name.ilike.${term},message.ilike.${term}`,
    );
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ tickets: (data ?? []) as SupportTicketRow[] });
}
