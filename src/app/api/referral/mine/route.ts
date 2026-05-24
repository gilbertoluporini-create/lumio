import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/referral/mine
 *
 * Retorna o código de embaixador do usuário logado, criando on-demand se
 * ainda não existe. Inclui stats agregadas (clicks, signups, paid, reward).
 *
 * Resposta:
 *   { code: "LUMI-AB3X", url: "https://lumioapp.net/?ref=LUMI-AB3X",
 *     stats: { total_clicks, total_signups, total_paid, total_reward_brl },
 *     redemptions: [...últimas 20] }
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

  // Pega ou cria o código
  let { data: codeRow } = await admin
    .from("referral_codes")
    .select("id, code, total_clicks, total_signups, total_paid, total_reward_brl, created_at")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!codeRow) {
    // Gera código novo via função SQL
    const { data: codeData, error: codeErr } = await admin.rpc("generate_referral_code");
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
      .select("id, code, total_clicks, total_signups, total_paid, total_reward_brl, created_at")
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

  // Pega últimas 20 redemptions
  const { data: redemptions } = await admin
    .from("referral_redemptions")
    .select("id, status, plan, signed_up_at, paid_at, reward_brl, reward_applied")
    .eq("referrer_user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "https://lumioapp.net";

  return NextResponse.json({
    code: codeRow.code,
    url: `${appUrl}/?ref=${codeRow.code}`,
    stats: {
      total_clicks: codeRow.total_clicks ?? 0,
      total_signups: codeRow.total_signups ?? 0,
      total_paid: codeRow.total_paid ?? 0,
      total_reward_brl: Number(codeRow.total_reward_brl ?? 0),
    },
    redemptions: redemptions ?? [],
    created_at: codeRow.created_at,
  });
}
