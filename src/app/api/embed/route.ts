/**
 * POST /api/embed
 *
 * Indexa um trecho de conteúdo via embedding (text-embedding-3-small) e salva
 * em `content_embeddings` pra busca semântica posterior (RAG).
 *
 * Body: {
 *   sourceKind: "lecture" | "document" | "summary" | "slide",
 *   sourceId: string (id da lecture/document/etc),
 *   subjectId?: string,
 *   text: string,
 *   metadata?: Record<string, unknown>
 * }
 *
 * Auth: user precisa ser dono da source (lecture/document) — valida via FK.
 * Rate limit: 30 indexações/min/user (anti-abuse + protege OpenAI cap).
 * Custo: ~$0.0005 pra 50 pgs de PDF.
 *
 * Comportamento: deleta chunks antigos da mesma source antes de inserir
 * (reindexação idempotente — não acumula chunks duplicados quando user
 * re-anexa PDF, regrava aula, etc).
 */

import {
  chunkText,
  generateEmbeddingsBatch,
  type ChunkMetadata,
  type SourceKind,
} from "@/lib/embeddings";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { getClientIp, limitOrThrow } from "@/lib/rate-limit";
import { logAiUsage } from "@/lib/ai-usage";
import { logAndSanitize } from "@/lib/api-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

type Body = {
  sourceKind?: SourceKind;
  sourceId?: string;
  subjectId?: string | null;
  text?: string;
  metadata?: ChunkMetadata;
};

const VALID_KINDS: SourceKind[] = ["lecture", "document", "summary", "slide"];
const MAX_TEXT_CHARS = 500_000; // 500k chars ≈ 200 págs ≈ 125k tokens

export async function POST(req: Request) {
  const ip = getClientIp(req);
  const ipLimit = limitOrThrow(`embed:ip:${ip}`, 30, 60_000);
  if (ipLimit) return ipLimit;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return Response.json({ error: "JSON inválido." }, { status: 400 });
  }

  const sourceKind = body.sourceKind;
  const sourceId = body.sourceId;
  const text = body.text;
  if (!sourceKind || !VALID_KINDS.includes(sourceKind)) {
    return Response.json(
      { error: "sourceKind inválido (lecture | document | summary | slide)." },
      { status: 400 },
    );
  }
  if (!sourceId || typeof sourceId !== "string") {
    return Response.json({ error: "sourceId obrigatório." }, { status: 400 });
  }
  if (!text || typeof text !== "string" || text.trim().length < 20) {
    return Response.json(
      { error: "text muito curto pra indexar (mínimo 20 chars)." },
      { status: 400 },
    );
  }
  if (text.length > MAX_TEXT_CHARS) {
    return Response.json(
      {
        error: `text excede ${MAX_TEXT_CHARS} chars. Quebre em pedaços ou passe um source_id por seção.`,
      },
      { status: 413 },
    );
  }

  // Auth
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Faça login." }, { status: 401 });
  }

  const userLimit = limitOrThrow(`embed:user:${user.id}`, 20, 60_000);
  if (userLimit) return userLimit;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "OPENAI_API_KEY não configurada." },
      { status: 503 },
    );
  }

  const admin = createAdminClient();

  // Valida ownership da source. Pular pra "slide" — usa sourceId do lecture
  // dono (validação genérica por user no insert).
  if (sourceKind === "lecture") {
    const { data: lec } = await admin
      .from("lectures")
      .select("id, subject_id")
      .eq("id", sourceId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!lec) return Response.json({ error: "Lecture não encontrada." }, { status: 404 });
  } else if (sourceKind === "document") {
    const { data: doc } = await admin
      .from("documents")
      .select("id, subject_id")
      .eq("id", sourceId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!doc) return Response.json({ error: "Document não encontrado." }, { status: 404 });
  } else if (sourceKind === "summary") {
    const { data: sm } = await admin
      .from("summaries")
      .select("id, subject_id")
      .eq("id", sourceId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!sm) return Response.json({ error: "Summary não encontrado." }, { status: 404 });
  }

  try {
    // 1. Chunk
    const chunks = chunkText(text);
    if (chunks.length === 0) {
      return Response.json({ chunks: 0, message: "Texto vazio após limpeza." });
    }

    // 2. Embed em batch
    const { embeddings, totalTokens } = await generateEmbeddingsBatch(
      chunks.map((c) => c.content),
      apiKey,
    );

    // 3. Apaga chunks antigos da mesma source (re-indexação idempotente)
    const { error: delErr } = await admin
      .from("content_embeddings")
      .delete()
      .eq("user_id", user.id)
      .eq("source_kind", sourceKind)
      .eq("source_id", sourceId);
    if (delErr) {
      console.error("[embed] delete old chunks failed", delErr);
    }

    // 4. Insere novos
    const rows = chunks.map((c, i) => ({
      user_id: user.id,
      source_kind: sourceKind,
      source_id: sourceId,
      subject_id: body.subjectId ?? null,
      chunk_index: i,
      content: c.content,
      embedding: embeddings[i],
      metadata: {
        ...(body.metadata ?? {}),
        char_start: c.charStart,
        char_end: c.charStart + c.content.length,
      },
    }));

    const { error: insErr } = await admin
      .from("content_embeddings")
      .insert(rows);
    if (insErr) {
      console.error("[embed] insert failed", insErr);
      return Response.json(
        { error: `Falha ao salvar embeddings: ${insErr.message}` },
        { status: 500 },
      );
    }

    // 5. Log custo
    try {
      await logAiUsage({
        userId: user.id,
        endpoint: "embed",
        model: "text-embedding-3-small",
        inputTokens: totalTokens,
        outputTokens: 0,
      });
    } catch {
      /* ignora — telemetria não derruba fluxo */
    }

    return Response.json({
      chunks: chunks.length,
      tokens: totalTokens,
    });
  } catch (err) {
    return Response.json(logAndSanitize("api/embed", err), { status: 500 });
  }
}
