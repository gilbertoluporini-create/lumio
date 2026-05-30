import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/server";
import { requireAdmin, logAdminAction } from "@/lib/admin";
import { getStripe, isStripeConfigured } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type AdminAmbassadorRow = {
  user_id: string;
  email: string;
  name: string | null;
  code: string;
  coupon_code: string | null;
  pix_key: string | null;
  commission_rate: number;
  total_signups: number;
  total_paid: number;
  total_reward_brl: number;
  created_at: string;
  admin_notes: string | null;
};

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const admin = createAdminClient();

  // 1) Profiles marcados como embaixador
  const { data: profiles, error: profErr } = await admin
    .from("profiles")
    .select("id, email, name")
    .eq("is_ambassador", true)
    .order("created_at", { ascending: false });

  if (profErr) {
    return NextResponse.json({ error: profErr.message }, { status: 500 });
  }

  const profileRows = (profiles ?? []) as Array<{
    id: string;
    email: string;
    name: string | null;
  }>;

  if (profileRows.length === 0) {
    return NextResponse.json({ ambassadors: [] });
  }

  const ids = profileRows.map((p) => p.id);

  // 2) Codes correspondentes
  const { data: codes } = await admin
    .from("referral_codes")
    .select(
      "user_id, code, coupon_code, pix_key, commission_rate, total_signups, total_paid, total_reward_brl, created_at, admin_notes",
    )
    .in("user_id", ids);

  const codeMap = new Map<
    string,
    Omit<AdminAmbassadorRow, "email" | "name">
  >();
  for (const c of (codes ?? []) as Array<Omit<AdminAmbassadorRow, "email" | "name">>) {
    codeMap.set(c.user_id, c);
  }

  const ambassadors: AdminAmbassadorRow[] = profileRows
    .map((p) => {
      const c = codeMap.get(p.id);
      if (!c) return null;
      return { ...c, email: p.email, name: p.name };
    })
    .filter((x): x is AdminAmbassadorRow => x !== null);

  return NextResponse.json({ ambassadors });
}

const ApproveSchema = z.object({
  email: z.string().email("Email inválido."),
  coupon_code: z
    .string()
    .trim()
    .min(3, "Cupom precisa ter ao menos 3 caracteres.")
    .max(30, "Cupom muito longo (máx 30 caracteres).")
    .regex(/^[A-Z0-9_-]+$/, "Use só A-Z, 0-9, _ ou -."),
  commission_rate: z.number().min(0).max(1),
  percent_off: z.number().int().min(1).max(100).optional(),
  create_stripe_coupon: z.boolean().optional().default(false),
  admin_notes: z.string().max(500).optional(),
});

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const parsed = ApproveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Validação falhou." },
      { status: 400 },
    );
  }

  const {
    email,
    coupon_code,
    commission_rate,
    percent_off,
    create_stripe_coupon,
    admin_notes,
  } = parsed.data;

  const couponUpper = coupon_code.toUpperCase();
  const admin = createAdminClient();

  // 1) Acha user por email
  const { data: profile } = await admin
    .from("profiles")
    .select("id, email, name, is_ambassador")
    .eq("email", email.toLowerCase())
    .maybeSingle();

  if (!profile) {
    return NextResponse.json(
      { error: `Usuário ${email} não encontrado. Peça pra ele criar conta no Lumio antes.` },
      { status: 404 },
    );
  }

  const userRow = profile as {
    id: string;
    email: string;
    name: string | null;
    is_ambassador: boolean | null;
  };

  // 2) Checa duplicidade de cupom
  const { data: existingCoupon } = await admin
    .from("referral_codes")
    .select("user_id")
    .eq("coupon_code", couponUpper)
    .maybeSingle();

  if (existingCoupon && (existingCoupon as { user_id: string }).user_id !== userRow.id) {
    return NextResponse.json(
      { error: `Cupom ${couponUpper} já está em uso por outro embaixador.` },
      { status: 409 },
    );
  }

  // 3) Cria cupom Stripe se pediu (e Stripe está configurado)
  let stripeCouponId: string | null = null;
  let stripePromoCodeId: string | null = null;
  let stripeWarning: string | null = null;

  if (create_stripe_coupon) {
    if (!isStripeConfigured()) {
      stripeWarning = "Stripe não configurado — cupom Stripe NÃO foi criado, só linkado no DB.";
    } else if (!percent_off) {
      return NextResponse.json(
        { error: "percent_off obrigatório quando create_stripe_coupon=true." },
        { status: 400 },
      );
    } else {
      try {
        const stripe = getStripe();
        // Stripe coupon.name limita em 40 chars. Truncamos pro cupom caber.
        // Email completo vai pro metadata abaixo.
        const baseName = `Embaixador ${couponUpper}`;
        const couponName =
          baseName.length > 40 ? baseName.slice(0, 40) : baseName;
        // Coupon (template do desconto)
        const coupon = await stripe.coupons.create({
          percent_off,
          duration: "forever",
          name: couponName,
          metadata: {
            ambassador_user_id: userRow.id,
            ambassador_email: userRow.email,
            commission_rate: String(commission_rate),
          },
        });
        stripeCouponId = coupon.id;

        // Promotion code (o que o user digita no checkout)
        const promo = await stripe.promotionCodes.create({
          promotion: { type: "coupon", coupon: coupon.id },
          code: couponUpper,
          metadata: {
            ambassador_user_id: userRow.id,
            ambassador_email: userRow.email,
          },
        });
        stripePromoCodeId = promo.id;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return NextResponse.json(
          { error: `Falha ao criar cupom Stripe: ${msg}` },
          { status: 500 },
        );
      }
    }
  }

  // 4) Cria/atualiza referral_code (mantém tracking code se já existe)
  const { data: existingCode } = await admin
    .from("referral_codes")
    .select("id, code")
    .eq("user_id", userRow.id)
    .maybeSingle();

  let trackingCode: string;
  if (existingCode) {
    trackingCode = (existingCode as { code: string }).code;
    const { error: updErr } = await admin
      .from("referral_codes")
      .update({
        coupon_code: couponUpper,
        commission_rate,
        admin_notes: admin_notes ?? null,
      })
      .eq("user_id", userRow.id);
    if (updErr) {
      return NextResponse.json({ error: updErr.message }, { status: 500 });
    }
  } else {
    // Gera código de tracking LUMI-XXXX via RPC
    const { data: codeData, error: codeErr } = await admin.rpc(
      "generate_referral_code",
    );
    if (codeErr || !codeData) {
      return NextResponse.json(
        { error: `Não foi possível gerar código de tracking: ${codeErr?.message ?? "unknown"}` },
        { status: 500 },
      );
    }
    trackingCode = codeData as string;
    const { error: insErr } = await admin.from("referral_codes").insert({
      user_id: userRow.id,
      code: trackingCode,
      coupon_code: couponUpper,
      commission_rate,
      admin_notes: admin_notes ?? null,
    });
    if (insErr) {
      return NextResponse.json({ error: insErr.message }, { status: 500 });
    }
  }

  // 5) Marca is_ambassador=true
  if (!userRow.is_ambassador) {
    const { error: profErr } = await admin
      .from("profiles")
      .update({ is_ambassador: true })
      .eq("id", userRow.id);
    if (profErr) {
      return NextResponse.json({ error: profErr.message }, { status: 500 });
    }
  }

  // 6) Audit log
  await logAdminAction({
    adminEmail: guard.admin.email,
    action: "approve_ambassador",
    targetUserId: userRow.id,
    targetUserEmail: userRow.email,
    metadata: {
      coupon_code: couponUpper,
      commission_rate,
      tracking_code: trackingCode,
      stripe_coupon_id: stripeCouponId,
      stripe_promo_code_id: stripePromoCodeId,
      percent_off: percent_off ?? null,
    },
  });

  return NextResponse.json({
    ok: true,
    ambassador: {
      user_id: userRow.id,
      email: userRow.email,
      name: userRow.name,
      tracking_code: trackingCode,
      coupon_code: couponUpper,
      commission_rate,
      stripe_coupon_id: stripeCouponId,
      stripe_promo_code_id: stripePromoCodeId,
      warning: stripeWarning,
    },
  });
}
