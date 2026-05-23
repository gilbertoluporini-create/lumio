import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getAppUrl } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  return NextResponse.json({
    ok: true,
    needsConfirmation,
    message: needsConfirmation
      ? "Cheque seu email pra confirmar a conta."
      : "Conta criada!",
  });
}
