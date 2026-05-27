/**
 * /api/admin/marketing/outbound
 *
 * GET  → lista drafts (filtra por status/platform)
 * POST → cria draft manual (input handle + platform)
 * PATCH → atualiza status (approved/rejected/sent/replied)
 *
 * Apenas admin.
 */

import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DraftRow = {
  id: string;
  platform: string;
  handle: string;
  profile_url: string | null;
  profile_research: Record<string, unknown> | null;
  draft_text: string;
  reasoning: string | null;
  voice: string;
  score: number | null;
  score_reason: string | null;
  status: string;
  approved_at: string | null;
  sent_at: string | null;
  replied_at: string | null;
  reply_text: string | null;
  conversion: boolean;
  created_at: string;
  updated_at: string;
};

const ALLOWED_STATUS = [
  "pending",
  "approved",
  "rejected",
  "sent",
  "replied",
  "bounced",
] as const;

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { searchParams } = req.nextUrl;
  const status = searchParams.get("status");
  const platform = searchParams.get("platform");
  const limit = Math.min(Number(searchParams.get("limit") || 50), 200);

  const supabase = createAdminClient();
  let query = supabase
    .from("outbound_drafts")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (status) query = query.eq("status", status);
  if (platform) query = query.eq("platform", platform);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // counts agregados
  const { data: counts } = await supabase
    .from("outbound_drafts")
    .select("status");

  const byStatus: Record<string, number> = {};
  for (const row of counts || []) {
    byStatus[row.status] = (byStatus[row.status] || 0) + 1;
  }

  return NextResponse.json({
    drafts: (data || []) as DraftRow[],
    counts: byStatus,
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null);
  if (!body?.handle || !body?.platform) {
    return NextResponse.json(
      { error: "handle e platform são obrigatórios" },
      { status: 400 },
    );
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("outbound_drafts")
    .insert({
      handle: String(body.handle).trim(),
      platform: String(body.platform).trim(),
      profile_url: body.profile_url ?? null,
      draft_text: body.draft_text ?? "(rascunho pendente — clique 'Gerar' para preencher)",
      reasoning: body.reasoning ?? null,
      voice: body.voice ?? "casual",
      score: body.score ?? null,
      score_reason: body.score_reason ?? null,
      profile_research: body.profile_research ?? {},
      status: "pending",
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ draft: data });
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
    if (body.status === "approved") updates.approved_at = new Date().toISOString();
    if (body.status === "sent") updates.sent_at = new Date().toISOString();
    if (body.status === "replied") updates.replied_at = new Date().toISOString();
  }

  if (typeof body.draft_text === "string") updates.draft_text = body.draft_text;
  if (typeof body.reply_text === "string") updates.reply_text = body.reply_text;
  if (typeof body.conversion === "boolean") updates.conversion = body.conversion;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "nada pra atualizar" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("outbound_drafts")
    .update(updates)
    .eq("id", body.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ draft: data });
}
