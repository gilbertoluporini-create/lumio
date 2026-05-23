import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(72),
});

export async function POST(req: Request) {
  let parsed: z.infer<typeof Body>;
  try {
    parsed = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  }

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
