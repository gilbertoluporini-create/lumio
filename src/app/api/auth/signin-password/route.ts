import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getClientIp, limitOrThrow } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(72),
});

export async function POST(req: Request) {
  // Rate limit por IP: barra burst (bot/scanner) na mesma origem.
  // 10 tentativas/min/IP cobre múltiplos usuários NAT atrás do mesmo IP
  // sem permitir brute-force massivo.
  const ip = getClientIp(req);
  const ipLimit = limitOrThrow(`signin:ip:${ip}`, 10, 60_000);
  if (ipLimit) return ipLimit;

  let parsed: z.infer<typeof Body>;
  try {
    parsed = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  }

  // Rate limit por EMAIL: barra credential-stuffing distribuído (rede de IPs
  // tentando a mesma conta). 5 tentativas / 5min é confortável pra user real
  // que erra a senha algumas vezes, mas trava ataque.
  const emailKey = parsed.email.toLowerCase();
  const emailLimit = limitOrThrow(`signin:email:${emailKey}`, 5, 300_000);
  if (emailLimit) return emailLimit;

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.email,
    password: parsed.password,
  });

  if (error) {
    const msg = error.message?.toLowerCase() ?? "";
    if (msg.includes("email not confirmed")) {
      return NextResponse.json(
        { error: "Confirma seu email antes de entrar (cheque a caixa de entrada)." },
        { status: 403 },
      );
    }
    // Não vazamos enumeração — mensagem genérica
    return NextResponse.json(
      { error: "Email ou senha incorretos." },
      { status: 401 },
    );
  }

  return NextResponse.json({ ok: true });
}
