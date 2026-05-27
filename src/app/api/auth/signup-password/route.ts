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

/**
 * Schema da attribution capturada client-side (localStorage `lumio.attribution`).
 * Todos opcionais — ausência total é OK (user direto sem UTM).
 *
 * Limitamos string length pra evitar abuso (max 500 chars por campo é
 * MAIS que suficiente — UTMs reais têm <50 chars).
 */
const AttributionSchema = z
  .object({
    source: z.string().max(500).nullable().optional(),
    medium: z.string().max(500).nullable().optional(),
    campaign: z.string().max(500).nullable().optional(),
    content: z.string().max(500).nullable().optional(),
    term: z.string().max(500).nullable().optional(),
    firstSource: z.string().max(500).nullable().optional(),
    firstMedium: z.string().max(500).nullable().optional(),
    firstCampaign: z.string().max(500).nullable().optional(),
    gclid: z.string().max(500).nullable().optional(),
    fbclid: z.string().max(500).nullable().optional(),
    ttclid: z.string().max(500).nullable().optional(),
    channel: z.string().max(100).nullable().optional(),
    firstTouchedAt: z.string().max(100).nullable().optional(),
    lastTouchedAt: z.string().max(100).nullable().optional(),
  })
  .partial()
  .optional();

const Body = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(72),
  name: z.string().min(2).max(120),
  next: z.string().startsWith("/").optional(),
  attribution: AttributionSchema,
});

type AttributionInput = z.infer<typeof AttributionSchema>;

/**
 * Persiste attribution em signup_attribution. Best-effort: nunca quebra signup.
 * Idempotente via upsert em PK (user_id) — se já existir, mantém o original
 * (first signup wins; preferimos NÃO sobrescrever pra preservar atribuição
 * primária, mesmo que o user faça re-signup hipoteticamente).
 */
async function persistAttribution(userId: string, attribution: AttributionInput | undefined) {
  if (!attribution) return;
  // Não vale a pena salvar registro vazio
  const hasAnything = Object.values(attribution).some(
    (v) => v !== null && v !== undefined && v !== "",
  );
  if (!hasAnything) return;
  try {
    const admin = createAdminClient();
    await admin.from("signup_attribution").upsert(
      { user_id: userId, attribution },
      { onConflict: "user_id", ignoreDuplicates: true },
    );
  } catch (err) {
    console.error("[signup-password] persist attribution failed", err);
  }
}

/**
 * Dispara `sign_up` no PostHog server-side com attribution attached.
 * Fire-and-forget — não bloqueia o response do signup.
 */
function fireSignupEventServerSide(
  userId: string,
  email: string,
  attribution: AttributionInput | undefined,
  method: "password",
) {
  const phKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const phHost = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";
  if (!phKey) return;

  void fetch(`${phHost}/capture/`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      api_key: phKey,
      event: "sign_up",
      distinct_id: userId,
      properties: {
        method,
        email,
        utm_source: attribution?.source ?? undefined,
        utm_medium: attribution?.medium ?? undefined,
        utm_campaign: attribution?.campaign ?? undefined,
        utm_content: attribution?.content ?? undefined,
        utm_term: attribution?.term ?? undefined,
        first_utm_source: attribution?.firstSource ?? undefined,
        first_utm_campaign: attribution?.firstCampaign ?? undefined,
        gclid: attribution?.gclid ?? undefined,
        fbclid: attribution?.fbclid ?? undefined,
        ttclid: attribution?.ttclid ?? undefined,
        channel: attribution?.channel ?? undefined,
        $set: {
          email,
          first_utm_source: attribution?.firstSource ?? undefined,
          first_utm_campaign: attribution?.firstCampaign ?? undefined,
        },
      },
      timestamp: new Date().toISOString(),
    }),
  }).catch(() => {
    /* fire-and-forget */
  });
}

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
    // Persiste attribution + dispara server-side sign_up no PostHog.
    // Server-side event garante captura mesmo se o user fechar a tab antes
    // de receber a response (raríssimo mas barato de cobrir).
    await persistAttribution(data.user.id, parsed.attribution);
    fireSignupEventServerSide(data.user.id, parsed.email, parsed.attribution, "password");
  }

  return NextResponse.json({
    ok: true,
    needsConfirmation,
    message: needsConfirmation
      ? "Cheque seu email pra confirmar a conta."
      : "Conta criada!",
  });
}
