import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Valida formato de chave PIX (CPF, CNPJ, e-mail, telefone +55 ou chave aleatória UUID v4).
 * Não checa duplicidade nem dígito verificador — só formato sintático.
 */
function isValidPixKey(key: string): boolean {
  const cleaned = key.trim();
  if (!cleaned) return false;

  // CPF: 11 dígitos (aceita com ou sem pontuação)
  if (/^\d{11}$/.test(cleaned.replace(/[.\-]/g, ""))) return true;
  // CNPJ: 14 dígitos (aceita com ou sem pontuação)
  if (/^\d{14}$/.test(cleaned.replace(/[.\-/]/g, ""))) return true;
  // E-mail
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned)) return true;
  // Telefone +55 + 10/11 dígitos (aceita com ou sem formatação)
  if (/^\+?55\d{10,11}$/.test(cleaned.replace(/[\s()\-]/g, ""))) return true;
  // Chave aleatória (UUID v4 formatado)
  if (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      cleaned,
    )
  )
    return true;

  return false;
}

/**
 * GET /api/referral/mine
 *
 * Retorna o código de embaixador do usuário logado, criando on-demand se
 * ainda não existe. Inclui stats agregadas + dados v2 (cupom Stripe, PIX,
 * commission_rate, comissão estimada do mês corrente).
 *
 * PATCH /api/referral/mine
 *
 * Embaixador atualiza a própria chave PIX (único campo editável pelo user).
 * Cupom e commission_rate são definidos pelo admin.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const admin = createAdminClient();

  let { data: codeRow } = await admin
    .from("referral_codes")
    .select(
      "id, code, total_clicks, total_signups, total_paid, total_reward_brl, created_at, coupon_code, pix_key, commission_rate",
    )
    .eq("user_id", user.id)
    .maybeSingle();

  if (!codeRow) {
    const { data: codeData, error: codeErr } = await admin.rpc(
      "generate_referral_code",
    );
    if (codeErr || !codeData) {
      console.error("[referral/mine] generate_referral_code failed", codeErr);
      return NextResponse.json(
        { error: "Não foi possível gerar código." },
        { status: 500 },
      );
    }

    const { data: inserted, error: insErr } = await admin
      .from("referral_codes")
      .insert({ user_id: user.id, code: codeData })
      .select(
        "id, code, total_clicks, total_signups, total_paid, total_reward_brl, created_at, coupon_code, pix_key, commission_rate",
      )
      .single();

    if (insErr || !inserted) {
      console.error("[referral/mine] insert failed", insErr);
      return NextResponse.json(
        { error: "Não foi possível criar código." },
        { status: 500 },
      );
    }

    codeRow = inserted;
  }

  const { data: redemptions } = await admin
    .from("referral_redemptions")
    .select(
      "id, status, plan, signed_up_at, paid_at, reward_brl, reward_applied",
    )
    .eq("referrer_user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20);

  // Comissão estimada do mês corrente (via function SQL)
  const { data: estimatedCommission } = await admin.rpc(
    "ambassador_estimated_commission",
    { p_user_id: user.id },
  );

  // Últimos payouts pagos (audit trail)
  const { data: recentPayouts } = await admin
    .from("ambassador_payouts")
    .select(
      "id, period_start, period_end, commission_brl, status, pix_paid_at, pix_transaction_id",
    )
    .eq("ambassador_user_id", user.id)
    .order("period_start", { ascending: false })
    .limit(6);

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "https://lumioapp.net";

  return NextResponse.json({
    code: codeRow.code,
    url: `${appUrl}/?ref=${codeRow.code}`,
    coupon_code: codeRow.coupon_code ?? null,
    pix_key: codeRow.pix_key ?? null,
    commission_rate: Number(codeRow.commission_rate ?? 0.25),
    stats: {
      total_clicks: codeRow.total_clicks ?? 0,
      total_signups: codeRow.total_signups ?? 0,
      total_paid: codeRow.total_paid ?? 0,
      total_reward_brl: Number(codeRow.total_reward_brl ?? 0),
      estimated_commission_brl: Number(estimatedCommission ?? 0),
    },
    redemptions: redemptions ?? [],
    payouts: recentPayouts ?? [],
    created_at: codeRow.created_at,
  });
}

export async function PATCH(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { pix_key?: string };
  const pix = typeof body.pix_key === "string" ? body.pix_key.trim() : "";

  if (!pix || pix.length < 3 || pix.length > 200) {
    return NextResponse.json(
      { error: "Chave PIX inválida (3-200 caracteres)." },
      { status: 400 },
    );
  }

  if (!isValidPixKey(pix)) {
    return NextResponse.json(
      {
        error:
          "PIX key inválido. Use CPF, CNPJ, e-mail, telefone (+55) ou chave aleatória UUID.",
      },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  // Checa duplicidade: ninguém pode reivindicar chave PIX que outro embaixador já cadastrou.
  const { data: dupe, error: dupeErr } = await admin
    .from("referral_codes")
    .select("user_id")
    .eq("pix_key", pix)
    .neq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (dupeErr) {
    console.error("[referral/mine PATCH] duplicate check failed", dupeErr);
    return NextResponse.json(
      { error: "Não foi possível validar a chave PIX." },
      { status: 500 },
    );
  }

  if (dupe) {
    return NextResponse.json(
      { error: "Esta chave PIX já está em uso por outro embaixador." },
      { status: 409 },
    );
  }

  const { error } = await admin
    .from("referral_codes")
    .update({ pix_key: pix })
    .eq("user_id", user.id);

  if (error) {
    console.error("[referral/mine PATCH] update failed", error);
    return NextResponse.json(
      { error: "Não foi possível salvar a chave PIX." },
      { status: 500 },
    );
  }

  // Audit log (não loga o valor da chave em si — só o evento)
  console.warn("[referral/mine] PIX updated", {
    userId: user.id,
    hasKey: !!pix,
  });

  return NextResponse.json({ ok: true, pix_key: pix });
}
