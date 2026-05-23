import { getBalance, listTransactions } from "@/lib/coins";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const supabaseEnabled = !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
  if (!supabaseEnabled) {
    return Response.json({ balance: 0, transactions: [], dev: true });
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return Response.json({ error: "Servidor incompleto." }, { status: 503 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Não autenticado." }, { status: 401 });
  }

  const url = new URL(req.url);
  const wantsHistory = url.searchParams.get("history") === "1";

  const [balance, transactions] = await Promise.all([
    getBalance(user.id),
    wantsHistory ? listTransactions(user.id, 100) : Promise.resolve([]),
  ]);

  return Response.json({ balance, transactions });
}
