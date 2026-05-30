/**
 * GET /api/study-plans/inflight-count
 *
 * Retorna quantos items o user tem em status='pending' ou 'generating'
 * em planos de estudo. Usado pelo badge global no menu lateral pra mostrar
 * que ainda há gerações rolando em background.
 *
 * Response: { count: number }
 */

import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ count: 0 });
  }

  const admin = createAdminClient();

  // Conta items inflight via inner-join no plano do user.
  const { count, error } = await admin
    .from("study_plan_items")
    .select("id, study_plans!inner(user_id)", { count: "exact", head: true })
    .in("status", ["pending", "generating"])
    .eq("study_plans.user_id", user.id);

  if (error) {
    return NextResponse.json({ count: 0, error: error.message });
  }

  return NextResponse.json({ count: count ?? 0 });
}
