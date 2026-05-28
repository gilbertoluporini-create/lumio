/**
 * GET /api/cron/publish-scheduled
 *
 * Vercel Cron (a cada 5min): pega drafts com status='scheduled' e
 * scheduled_for <= now(), publica nas redes alvo, atualiza status.
 *
 * Autenticação: Authorization: Bearer <CRON_SECRET> (Vercel manda automático).
 *
 * Idempotente: se 1 rede falhar e outras passarem, marca status='published' +
 * registra erros em sync_error. Se TODAS falharem, mantém 'scheduled' + grava
 * erro (próximo tick tenta de novo).
 *
 * Limite por tick: 5 drafts (evita estourar maxDuration em alta carga).
 */

import { createAdminClient } from "@/lib/supabase/server";
import {
  publishDraftToNetworks,
  extractTargetNetworks,
  type DraftForPublish,
} from "@/lib/marketing-publish";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const BATCH_SIZE = 5;

export async function GET(request: Request) {
  const auth = request.headers.get("authorization") ?? "";
  const expected = process.env.CRON_SECRET;
  if (process.env.NODE_ENV === "production" && expected) {
    if (auth !== `Bearer ${expected}`) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const supabase = createAdminClient();
  const now = new Date().toISOString();

  const { data: drafts, error: fetchErr } = await supabase
    .from("content_drafts")
    .select("id, slug, content_per_network, images, publish_results, status")
    .eq("status", "scheduled")
    .lte("scheduled_for", now)
    .order("scheduled_for", { ascending: true })
    .limit(BATCH_SIZE);

  if (fetchErr) {
    return Response.json(
      { error: `fetch falhou: ${fetchErr.message}` },
      { status: 500 },
    );
  }

  const list = (drafts || []) as DraftForPublish[];
  if (list.length === 0) {
    return Response.json({ ok: true, processed: 0, note: "nada agendado" });
  }

  const processed: Array<{
    slug: string | null;
    networks: string[];
    success: string[];
    failed: Record<string, string>;
  }> = [];

  for (const draft of list) {
    const networks = extractTargetNetworks(draft);
    const { results, errors } = await publishDraftToNetworks(draft, networks);

    const successCount = Object.keys(results).length;
    const errorCount = Object.keys(errors).length;

    // merge novo publish_results sem perder networks_target
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

    const updates: Record<string, unknown> = {
      publish_results: newResults,
    };

    if (successCount > 0) {
      updates.status = "published";
      updates.published_at = now;
    }

    if (errorCount > 0) {
      updates.sync_error = Object.entries(errors)
        .map(([net, msg]) => `${net}: ${msg}`)
        .join(" | ")
        .slice(0, 800);
    } else {
      updates.sync_error = null;
    }

    await supabase.from("content_drafts").update(updates).eq("id", draft.id);

    processed.push({
      slug: draft.slug,
      networks,
      success: Object.keys(results),
      failed: errors as Record<string, string>,
    });
  }

  return Response.json({
    ok: true,
    processed: processed.length,
    details: processed,
  });
}
