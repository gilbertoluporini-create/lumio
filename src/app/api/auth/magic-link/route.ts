import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getAppUrl } from "@/lib/stripe";
import { getClientIp, limitOrThrow } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(120).optional(),
  next: z.string().startsWith("/").optional(),
});

export async function POST(req: Request) {
  // Rate limit por IP: limita disparo de magic links massivos do mesmo origem
  // (proteção contra abuso de quota SMTP do Supabase).
  const ip = getClientIp(req);
  const ipLimit = limitOrThrow(`magic-link:ip:${ip}`, 10, 60_000);
  if (ipLimit) return ipLimit;

  let parsed: z.infer<typeof Body>;
  try {
    parsed = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  }

  // Rate limit por EMAIL: evita email-bombing de uma vítima específica
  // (atacante envia dezenas de magic-links pra encher inbox alheio).
  // 3 / 5min é suficiente pra user que perdeu o email e pediu de novo.
  const emailKey = parsed.email.toLowerCase();
  const emailLimit = limitOrThrow(`magic-link:email:${emailKey}`, 3, 300_000);
  if (emailLimit) return emailLimit;

  const supabase = await createClient();
  const appUrl = getAppUrl();
  const next = parsed.next && parsed.next.startsWith("/") ? parsed.next : "/dashboard";
  const redirectTo = `${appUrl}/auth/callback?next=${encodeURIComponent(next)}`;

  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.email,
    options: {
      shouldCreateUser: true,
      data: parsed.name ? { name: parsed.name } : undefined,
      emailRedirectTo: redirectTo,
    },
  });

  // Não vazamos enumeração — sempre 200 ok-ish, mesmo se já existir
  if (error) {
    console.error("[auth/magic-link]", error);
    return NextResponse.json(
      { ok: true, note: "Se o email for válido, enviamos o link." },
      { status: 200 },
    );
  }

  return NextResponse.json({
    ok: true,
    message: "Cheque seu email pra entrar.",
  });
}
