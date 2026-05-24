import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { requireAdmin, logAdminAction } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const { userId } = await params;

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("email")
    .eq("id", userId)
    .maybeSingle();
  if (!profile) {
    return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });
  }
  const email = (profile as { email: string }).email;

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ??
    "https://lumioapp.net";

  // Gera magic link (type: magiclink). Não envia email — só retorna a URL.
  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo: `${appUrl}/dashboard` },
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const payload = data as {
    properties?: { action_link?: string };
    action_link?: string;
  } | null;
  const link =
    payload?.properties?.action_link ?? payload?.action_link ?? null;
  if (!link) {
    return NextResponse.json(
      { error: "Falha ao gerar magic link." },
      { status: 500 },
    );
  }

  await logAdminAction({
    adminEmail: guard.admin.email,
    action: "impersonate",
    targetUserId: userId,
    targetUserEmail: email,
  });

  return NextResponse.json({ ok: true, magic_link: link, email });
}
