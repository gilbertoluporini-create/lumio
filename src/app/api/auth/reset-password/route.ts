import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getAppUrl } from "@/lib/stripe";
import { getClientIp, limitOrThrow } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  email: z.string().email(),
});

export async function POST(req: Request) {
  // Rate limit por IP: previne abuso massivo de reset-password do mesmo origem
  // (estourar quota SMTP, gerar ruído nos logs). 5 / 10min é folgado.
  const ip = getClientIp(req);
  const ipLimit = limitOrThrow(`reset-pw:ip:${ip}`, 5, 600_000);
  if (ipLimit) return ipLimit;

  let parsed: z.infer<typeof Body>;
  try {
    parsed = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Email inválido." }, { status: 400 });
  }

  // Rate limit por EMAIL: evita email-bombing de uma vítima específica
  // (atacante dispara N resets pra encher inbox e mascarar email legítimo).
  // 3 / 5min cobre user real que clicou várias vezes sem receber.
  const emailKey = parsed.email.toLowerCase();
  const emailLimit = limitOrThrow(`reset-pw:email:${emailKey}`, 3, 300_000);
  if (emailLimit) return emailLimit;

  const supabase = await createClient();
  const appUrl = getAppUrl();
  const redirectTo = `${appUrl}/auth/callback?next=${encodeURIComponent("/reset-password")}`;

  const { error } = await supabase.auth.resetPasswordForEmail(parsed.email, {
    redirectTo,
  });

  // Não vazamos enumeração — sempre ok-ish, mesmo se email não existir
  if (error) {
    console.error("[auth/reset-password]", error);
  }

  return NextResponse.json({
    ok: true,
    message: "Se o email for válido, enviamos um link pra redefinir a senha.",
  });
}
