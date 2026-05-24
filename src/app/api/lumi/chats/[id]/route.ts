import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

/**
 * DELETE — remove definitivamente o chat (após soft-delete vencer ou via "purge").
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!isUuid(id)) {
    return NextResponse.json({ error: "id inválido." }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const { error } = await supabase
    .from("lumi_chats")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    console.error("[api/lumi/chats/[id]][DELETE]", error);
    return NextResponse.json({ error: "Erro ao excluir." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
