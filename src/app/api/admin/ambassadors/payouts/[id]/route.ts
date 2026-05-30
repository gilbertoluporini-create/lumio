import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/server";
import { requireAdmin, logAdminAction } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PatchSchema = z.object({
  action: z.enum(["mark_paid", "mark_cancelled", "update_notes"]),
  pix_transaction_id: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(1000).optional(),
});

/**
 * PATCH /api/admin/ambassadors/payouts/[id]
 *
 * Marca payout como pago (após admin enviar PIX manual no banco),
 * cancela, ou atualiza notas.
 */
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
      { error: parsed.error.issues[0]?.message ?? "Validação falhou." },
      { status: 400 },
    );
  }

  const { action, pix_transaction_id, notes } = parsed.data;
  const admin = createAdminClient();

  // Lê estado atual
  const { data: current } = await admin
    .from("ambassador_payouts")
    .select("id, ambassador_user_id, status, commission_brl")
    .eq("id", id)
    .maybeSingle();

  if (!current) {
    return NextResponse.json({ error: "Payout não encontrado." }, { status: 404 });
  }

  const c = current as {
    id: string;
    ambassador_user_id: string;
    status: string;
    commission_brl: number;
  };

  if (action === "mark_paid") {
    if (c.status === "paid") {
      return NextResponse.json(
        { error: "Payout já estava marcado como pago." },
        { status: 409 },
      );
    }
    const { error } = await admin
      .from("ambassador_payouts")
      .update({
        status: "paid",
        pix_paid_at: new Date().toISOString(),
        pix_transaction_id: pix_transaction_id ?? null,
        notes: notes ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await logAdminAction({
      adminEmail: guard.admin.email,
      action: "payout_mark_paid",
      targetUserId: c.ambassador_user_id,
      metadata: {
        payout_id: id,
        commission_brl: c.commission_brl,
        pix_transaction_id: pix_transaction_id ?? null,
      },
    });

    return NextResponse.json({ ok: true, status: "paid" });
  }

  if (action === "mark_cancelled") {
    const { error } = await admin
      .from("ambassador_payouts")
      .update({
        status: "cancelled",
        notes: notes ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    await logAdminAction({
      adminEmail: guard.admin.email,
      action: "payout_cancelled",
      targetUserId: c.ambassador_user_id,
      metadata: { payout_id: id, notes: notes ?? null },
    });
    return NextResponse.json({ ok: true, status: "cancelled" });
  }

  if (action === "update_notes") {
    const { error } = await admin
      .from("ambassador_payouts")
      .update({
        notes: notes ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Ação desconhecida." }, { status: 400 });
}
