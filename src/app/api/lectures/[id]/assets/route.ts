import { createClient } from "@/lib/supabase/server";
import { logAndSanitize } from "@/lib/api-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return Response.json({ error: "lecture id required" }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return Response.json({ error: "auth required" }, { status: 401 });
    }

    // RLS já garante que o user só lê seus próprios assets
    const { data, error } = await supabase
      .from("lecture_assets")
      .select("id, kind, payload, coins_spent, created_at, updated_at")
      .eq("lecture_id", id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ assets: data ?? [] });
  } catch (err) {
    return Response.json(
      logAndSanitize("api/lectures/[id]/assets", err),
      { status: 500 },
    );
  }
}
