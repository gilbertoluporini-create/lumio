import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getAppUrl } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  email: z.string().email(),
});

export async function POST(req: Request) {
  let parsed: z.infer<typeof Body>;
  try {
    parsed = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Email inválido." }, { status: 400 });
  }

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
