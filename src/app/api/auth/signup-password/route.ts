import { NextResponse } from "next/server";
import { z } from "zod";
import { cookies, headers } from "next/headers";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { getAppUrl } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REF_COOKIE = "lumio_ref";
const REF_CODE_RE = /^LUMI-[A-Z0-9]{4}$/;

/**
 * Best-effort: se o user veio com cookie `lumio_ref` válido, cria registro
 * em referral_redemptions. Não bloqueia o signup se algo falhar.
 */
async function createRedemptionFromCookie(referredUserId: string) {
  try {
    const cookieStore = await cookies();
    const code = cookieStore.get(REF_COOKIE)?.value;
    if (!code || !REF_CODE_RE.test(code)) return;

    const admin = createAdminClient();
    const { data: codeRow } = await admin
      .from("referral_codes")
      .select("id, user_id, code")
      .eq("code", code)
      .maybeSingle();
    if (!codeRow) return;

    // Anti-self-referral
    if (codeRow.user_id === referredUserId) return;

    const hdrs = await headers();
    const forwardedFor = hdrs.get("x-forwarded-for") ?? "";
    const ip = forwardedFor.split(",")[0]?.trim() || hdrs.get("x-real-ip") || null;
    const userAgent = hdrs.get("user-agent")?.slice(0, 500) ?? null;

    await admin.from("referral_redemptions").insert({
      referral_code_id: codeRow.id,
      referrer_user_id: codeRow.user_id,
      referred_user_id: referredUserId,
      status: "signed_up",
      ip_address: ip,
      user_agent: userAgent,
    });

    // Cookie já cumpriu o papel — apaga pra evitar reuso indevido.
    cookieStore.delete(REF_COOKIE);
  } catch (err) {
    // Fail-soft: signup já foi bem sucedido, redemption é bônus.
    console.error("[signup-password] referral redemption failed", err);
  }
}

const Body = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(72),
  name: z.string().min(2).max(120),
  next: z.string().startsWith("/").optional(),
});

export async function POST(req: Request) {
  let parsed: z.infer<typeof Body>;
  try {
    parsed = Body.parse(await req.json());
  } catch {
    return NextResponse.json(
      { error: "Dados inválidos. Senha precisa ter 8+ caracteres." },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const appUrl = getAppUrl();
  const next = parsed.next && parsed.next.startsWith("/") ? parsed.next : "/onboarding";
  const redirectTo = `${appUrl}/auth/callback?next=${encodeURIComponent(next)}`;

  const { data, error } = await supabase.auth.signUp({
    email: parsed.email,
    password: parsed.password,
    options: {
      data: { name: parsed.name },
      emailRedirectTo: redirectTo,
    },
  });

  if (error) {
    const msg = error.message?.toLowerCase() ?? "";
    if (msg.includes("already registered") || msg.includes("already exists") || msg.includes("user already")) {
      return NextResponse.json(
        { error: "Esse email já tem conta. Tenta entrar." },
        { status: 409 },
      );
    }
    console.error("[auth/signup-password]", error);
    return NextResponse.json(
      { error: "Não foi possível criar a conta. Tenta de novo." },
      { status: 400 },
    );
  }

  const needsConfirmation = !data?.session;

  // Cria redemption se o user veio via link de embaixador (cookie lumio_ref).
  if (data?.user?.id) {
    await createRedemptionFromCookie(data.user.id);
  }

  return NextResponse.json({
    ok: true,
    needsConfirmation,
    message: needsConfirmation
      ? "Cheque seu email pra confirmar a conta."
      : "Conta criada!",
  });
}
