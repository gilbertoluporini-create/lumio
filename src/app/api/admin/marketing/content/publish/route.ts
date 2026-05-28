/**
 * POST /api/admin/marketing/content/publish
 *
 * Publica um content_draft em N redes (admin manual via UI).
 * Cron de agendamento usa a mesma lib em /api/cron/publish-scheduled.
 *
 * Body: { draft_id, networks?: ["instagram"|"facebook"|"x"|"linkedin"] }
 * Resp: { ok, results, errors }
 */

import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/server";
import {
  publishDraftToNetworks,
  extractTargetNetworks,
  ALL_NETWORKS,
  type DraftForPublish,
  type Network,
} from "@/lib/marketing-publish";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 90;

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null);
  if (!body?.draft_id) {
    return NextResponse.json({ error: "draft_id obrigatório" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: draftRaw, error: fetchErr } = await supabase
    .from("content_drafts")
    .select("*")
    .eq("id", body.draft_id)
    .single();

  if (fetchErr || !draftRaw) {
    return NextResponse.json({ error: "draft não encontrado" }, { status: 404 });
  }

  const draft = draftRaw as unknown as DraftForPublish;

  const requestedNetworks: Network[] = Array.isArray(body.networks)
    ? body.networks.filter((n: string) =>
        ALL_NETWORKS.includes(n as Network),
      )
    : extractTargetNetworks(draft);

  if (requestedNetworks.length === 0) {
    return NextResponse.json(
      { error: "nenhuma rede alvo (passe networks: [...] ou configure no metadata)" },
      { status: 400 },
    );
  }

  const { results, errors } = await publishDraftToNetworks(
    draft,
    requestedNetworks,
  );

  const now = new Date().toISOString();
  const prevResults = (draft.publish_results || {}) as Record<string, unknown>;
  const newResults = {
    ...prevResults,
    ...Object.fromEntries(
      Object.entries(results).map(([net, r]) => [
        net,
        { ...r, published_at: now },
      ]),
    ),
  };

  const updates: Record<string, unknown> = { publish_results: newResults };
  if (Object.keys(results).length > 0) {
    updates.status = "published";
    updates.published_at = now;
  }
  if (Object.keys(errors).length > 0) {
    updates.sync_error = Object.entries(errors)
      .map(([net, msg]) => `${net}: ${msg}`)
      .join(" | ")
      .slice(0, 800);
  } else {
    updates.sync_error = null;
  }

  await supabase.from("content_drafts").update(updates).eq("id", draft.id);

  return NextResponse.json({
    ok: Object.keys(results).length > 0,
    results,
    errors,
  });
}
