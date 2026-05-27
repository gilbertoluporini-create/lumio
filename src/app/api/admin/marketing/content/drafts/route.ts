/**
 * /api/admin/marketing/content/drafts
 *
 * GET   → lista drafts (filtros por status/category)
 * POST  → cria draft (idea_title obrigatório)
 * PATCH → atualiza draft (content_per_network, images, status, scheduled_for, etc)
 * DELETE → remove draft (?id=)
 *
 * Apenas admin.
 */

import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_STATUS = [
  "idea",
  "drafted",
  "approved",
  "scheduled",
  "published",
  "rejected",
] as const;

const ALLOWED_CATEGORY = ["educacional", "opiniao", "dados", "bts"] as const;

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { searchParams } = req.nextUrl;
  const status = searchParams.get("status");
  const category = searchParams.get("category");
  const limit = Math.min(Number(searchParams.get("limit") || 50), 200);

  const supabase = createAdminClient();
  let query = supabase
    .from("content_drafts")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (status) query = query.eq("status", status);
  if (category) query = query.eq("category", category);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // counts agregados (todos drafts)
  const { data: allCounts } = await supabase
    .from("content_drafts")
    .select("status,category");

  const byStatus: Record<string, number> = {};
  const byCategory: Record<string, number> = {};
  for (const row of allCounts || []) {
    byStatus[row.status] = (byStatus[row.status] || 0) + 1;
    byCategory[row.category] = (byCategory[row.category] || 0) + 1;
  }

  return NextResponse.json({
    drafts: data || [],
    counts: { by_status: byStatus, by_category: byCategory },
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null);
  if (!body?.idea_title) {
    return NextResponse.json(
      { error: "idea_title obrigatório" },
      { status: 400 },
    );
  }

  const category = ALLOWED_CATEGORY.includes(body.category)
    ? body.category
    : "educacional";

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("content_drafts")
    .insert({
      idea_title: String(body.idea_title).trim().slice(0, 300),
      idea_summary: body.idea_summary
        ? String(body.idea_summary).slice(0, 2000)
        : null,
      category,
      status: "idea",
      created_by_admin: auth.admin.email,
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
  const now = new Date().toISOString();

  if (body.status) {
    if (!ALLOWED_STATUS.includes(body.status)) {
      return NextResponse.json({ error: "status inválido" }, { status: 400 });
    }
    updates.status = body.status;
    if (body.status === "approved") updates.approved_at = now;
    if (body.status === "published") updates.published_at = now;
  }

  if (typeof body.idea_title === "string")
    updates.idea_title = body.idea_title.slice(0, 300);
  if (typeof body.idea_summary === "string")
    updates.idea_summary = body.idea_summary.slice(0, 2000);
  if (body.category && ALLOWED_CATEGORY.includes(body.category))
    updates.category = body.category;

  if (body.content_per_network && typeof body.content_per_network === "object")
    updates.content_per_network = body.content_per_network;

  if (body.images && typeof body.images === "object")
    updates.images = body.images;

  if (typeof body.scheduled_for === "string" || body.scheduled_for === null)
    updates.scheduled_for = body.scheduled_for;

  if (body.publish_results && typeof body.publish_results === "object")
    updates.publish_results = body.publish_results;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "nada pra atualizar" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("content_drafts")
    .update(updates)
    .eq("id", body.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ draft: data });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id obrigatório" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("content_drafts")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
