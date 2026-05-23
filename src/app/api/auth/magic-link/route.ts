import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getAppUrl } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(120).optional(),
  next: z.string().startsWith("/").optional(),
});

export async function POST(req: Request) {
  let parsed: z.infer<typeof Body>;
  try {
    parsed = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  }

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
