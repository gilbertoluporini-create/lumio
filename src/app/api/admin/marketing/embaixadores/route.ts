/**
 * /api/admin/marketing/embaixadores
 *
 * GET   → lista embaixadores (todos)
 * POST  → cria embaixador (convidado)
 * PATCH → atualiza (status / divulgação / Pro concedido)
 *
 * Programa: amigos próximos recebem Pro grátis em troca de divulgação no perfil
 * social próprio (story/post mencionando @lumioapp.br). Métricas via UTM
 * `?utm_source=embaixador&utm_medium=story&utm_campaign=<id>`.
 *
 * Apenas admin.
 */

import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_STATUS = [
  "convidado",
  "aceito",
  "ativo",
  "pausado",
  "cancelado",
] as const;

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { searchParams } = req.nextUrl;
  const status = searchParams.get("status");

  const supabase = createAdminClient();
  let query = supabase
    .from("embaixadores")
    .select("*")
    .order("created_at", { ascending: false });

  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const byStatus: Record<string, number> = {};
  for (const row of data || []) {
    byStatus[row.status] = (byStatus[row.status] || 0) + 1;
  }

  return NextResponse.json({
    embaixadores: data || [],
    counts: byStatus,
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null);
  if (!body?.nome) {
    return NextResponse.json(
      { error: "nome obrigatório" },
      { status: 400 },
    );
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("embaixadores")
    .insert({
      nome: String(body.nome).trim(),
      email: body.email ?? null,
      handle_instagram: body.handle_instagram ?? null,
      handle_tiktok: body.handle_tiktok ?? null,
      curso: body.curso ?? null,
      faculdade: body.faculdade ?? null,
      cidade: body.cidade ?? null,
      notas: body.notas ?? null,
      status: "convidado",
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ embaixador: data });
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
    if (body.status === "aceito") updates.aceitou_em = now;
    if (body.status === "ativo") updates.ativou_em = now;
  }

  if (typeof body.divulgacoes_count === "number")
    updates.divulgacoes_count = body.divulgacoes_count;
  if (typeof body.signups_atribuidos === "number")
    updates.signups_atribuidos = body.signups_atribuidos;

  if (body.pro_concedido === true && !updates.pro_concedido_em) {
    updates.pro_concedido = true;
    updates.pro_concedido_em = now;
    // 90 dias default
    updates.pro_expira_em = new Date(
      Date.now() + 90 * 24 * 60 * 60 * 1000,
    ).toISOString();
  }

  if (typeof body.notas === "string") updates.notas = body.notas;
  if (typeof body.ultima_divulgacao_em === "string")
    updates.ultima_divulgacao_em = body.ultima_divulgacao_em;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "nada pra atualizar" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("embaixadores")
    .update(updates)
    .eq("id", body.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ embaixador: data });
}
