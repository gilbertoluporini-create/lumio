import { NextResponse } from "next/server";
import { z } from "zod";
import { cookies, headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  code: z.string().regex(/^LUMI-[A-Z0-9]{4}$/),
  referrer_url: z.string().optional(),
  utm_source: z.string().optional(),
  utm_medium: z.string().optional(),
  utm_campaign: z.string().optional(),
});

const REF_COOKIE = "lumio_ref";
const REF_COOKIE_MAX_AGE = 60 * 60 * 24 * 60; // 60 dias

/**
 * POST /api/referral/track
 *
 * Registra clique num link de embaixador e salva cookie `lumio_ref` por 60 dias.
 * Quando o user faz signup, o signup-password lê o cookie e cria redemption.
 *
 * Body: { code: "LUMI-XXXX", referrer_url?, utm_*? }
 */
export async function POST(req: Request) {
  let parsed: z.infer<typeof Body>;
  try {
    parsed = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Código inválido" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Confere se o código existe (idempotente)
  const { data: codeRow } = await admin
    .from("referral_codes")
    .select("id, user_id, code")
    .eq("code", parsed.code)
    .maybeSingle();

  if (!codeRow) {
    return NextResponse.json({ error: "Código não encontrado" }, { status: 404 });
  }

  // Captura IP e user agent (anti-fraude)
  const hdrs = await headers();
  const forwardedFor = hdrs.get("x-forwarded-for") ?? "";
  const ip = forwardedFor.split(",")[0]?.trim() || hdrs.get("x-real-ip") || null;
  const userAgent = hdrs.get("user-agent") ?? "";

  // Insere click (best-effort, não bloqueia se falhar)
  try {
    await admin.from("referral_clicks").insert({
      referral_code_id: codeRow.id,
      code: codeRow.code,
      ip_address: ip,
      user_agent: userAgent.slice(0, 500),
      referrer_url: parsed.referrer_url?.slice(0, 500),
      utm_source: parsed.utm_source?.slice(0, 100),
      utm_medium: parsed.utm_medium?.slice(0, 100),
      utm_campaign: parsed.utm_campaign?.slice(0, 100),
    });
  } catch (err) {
    console.error("[referral/track] insert click failed", err);
  }

  // Salva cookie
  const cookieStore = await cookies();
  cookieStore.set(REF_COOKIE, codeRow.code, {
    maxAge: REF_COOKIE_MAX_AGE,
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
  });

  return NextResponse.json({ ok: true });
}

/**
 * GET /api/referral/track?code=LUMI-XXXX
 *
 * Atalho pra GET requests vindas de share links direto.
 * Aceita query string, redireciona pra raiz após registrar.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code") || url.searchParams.get("ref");

  if (!code || !/^LUMI-[A-Z0-9]{4}$/.test(code)) {
    return NextResponse.redirect(new URL("/", url));
  }

  // Reusa lógica do POST chamando admin direto
  const admin = createAdminClient();
  const { data: codeRow } = await admin
    .from("referral_codes")
    .select("id, code")
    .eq("code", code)
    .maybeSingle();

  if (codeRow) {
    const hdrs = await headers();
    const forwardedFor = hdrs.get("x-forwarded-for") ?? "";
    const ip = forwardedFor.split(",")[0]?.trim() || hdrs.get("x-real-ip") || null;

    try {
      await admin.from("referral_clicks").insert({
        referral_code_id: codeRow.id,
        code: codeRow.code,
        ip_address: ip,
        user_agent: hdrs.get("user-agent")?.slice(0, 500),
        referrer_url: url.searchParams.get("utm_source") ?? null,
        utm_source: url.searchParams.get("utm_source"),
        utm_medium: url.searchParams.get("utm_medium"),
        utm_campaign: url.searchParams.get("utm_campaign"),
      });
    } catch (err) {
      console.error("[referral/track GET] insert click failed", err);
    }

    const cookieStore = await cookies();
    cookieStore.set(REF_COOKIE, codeRow.code, {
      maxAge: REF_COOKIE_MAX_AGE,
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
    });
  }

  // Sempre redireciona pra home com ref preservado na URL (analytics)
  const redirectUrl = new URL("/", url);
  redirectUrl.searchParams.set("ref", code);
  return NextResponse.redirect(redirectUrl);
}
