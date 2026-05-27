/**
 * RAG: embedding + busca semântica.
 *
 * Modelo: OpenAI text-embedding-3-small (1536 dims, $0.02/Mtok)
 * Storage: Supabase pgvector (tabela `content_embeddings`)
 *
 * Fluxo típico:
 *   1. `indexContent({ userId, sourceKind, sourceId, text, subjectId })`
 *      → chunka texto → gera embeddings em batch → upserta no banco.
 *   2. `searchRelevantChunks({ userId, query, subjectId? })`
 *      → embeda a query → busca top-K via pgvector → retorna trechos.
 *
 * Custo: $0.02/Mtok → indexar PDF de 50 págs (~25k tokens) = $0.0005.
 * Busca: $0.02/Mtok pra embedar a query (~20 tokens) = negligível.
 */

const OPENAI_EMBEDDINGS_URL = "https://api.openai.com/v1/embeddings";
const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMS = 1536;

/** Max chars por chunk. ~500 palavras = ~2000 chars. Bom equilíbrio:
 *  contexto suficiente sem dispersar similaridade demais. */
const CHUNK_SIZE = 2000;
/** Overlap entre chunks pra não cortar conceitos no meio. */
const CHUNK_OVERLAP = 200;

/** Limite de chars por single embed call. OpenAI aceita até ~8k tokens. */
const MAX_CHARS_PER_EMBED = 30_000;

export type ChunkMetadata = {
  page_number?: number;
  slide_title?: string;
  char_start?: number;
  char_end?: number;
  [key: string]: unknown;
};

export type SourceKind = "lecture" | "document" | "summary" | "slide";

/**
 * Quebra texto em chunks de ~CHUNK_SIZE chars com overlap.
 * Tenta cortar em quebras naturais (parágrafos, frases) quando possível.
 */
export function chunkText(text: string): Array<{ content: string; charStart: number }> {
  const cleaned = text.trim().replace(/\s+/g, " ");
  if (cleaned.length === 0) return [];
  if (cleaned.length <= CHUNK_SIZE) {
    return [{ content: cleaned, charStart: 0 }];
  }

  const chunks: Array<{ content: string; charStart: number }> = [];
  let cursor = 0;
  while (cursor < cleaned.length) {
    const end = Math.min(cursor + CHUNK_SIZE, cleaned.length);
    // Tenta cortar numa quebra natural antes do end
    let cutAt = end;
    if (end < cleaned.length) {
      // Procura último ponto/parágrafo no range
      const tail = cleaned.slice(cursor, end);
      const lastPara = tail.lastIndexOf("\n\n");
      const lastDot = tail.lastIndexOf(". ");
      const last = Math.max(lastPara, lastDot);
      if (last > CHUNK_SIZE * 0.5) {
        cutAt = cursor + last + 1;
      }
    }
    chunks.push({
      content: cleaned.slice(cursor, cutAt).trim(),
      charStart: cursor,
    });
    if (cutAt >= cleaned.length) break;
    cursor = Math.max(cutAt - CHUNK_OVERLAP, cursor + 1);
  }
  return chunks;
}

type OpenAIEmbeddingsResponse = {
  data: Array<{ embedding: number[]; index: number }>;
  model: string;
  usage: { prompt_tokens: number; total_tokens: number };
  error?: { message: string };
};

/**
 * Gera embeddings em batch (1 chamada pra múltiplos textos).
 * Trunca cada texto pra MAX_CHARS_PER_EMBED pra ficar dentro do limite de tokens.
 * Retorna array na mesma ordem da entrada.
 */
export async function generateEmbeddingsBatch(
  texts: string[],
  apiKey: string,
): Promise<{ embeddings: number[][]; totalTokens: number }> {
  if (texts.length === 0) return { embeddings: [], totalTokens: 0 };
  const inputs = texts.map((t) => t.slice(0, MAX_CHARS_PER_EMBED));

  const resp = await fetch(OPENAI_EMBEDDINGS_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: inputs,
      encoding_format: "float",
    }),
  });

  const json = (await resp.json()) as OpenAIEmbeddingsResponse;
  if (!resp.ok) {
    throw new Error(
      `OpenAI embeddings ${resp.status}: ${json.error?.message ?? "?"}`,
    );
  }
  // Garante ordem
  const sorted = json.data.slice().sort((a, b) => a.index - b.index);
  return {
    embeddings: sorted.map((d) => d.embedding),
    totalTokens: json.usage.total_tokens,
  };
}

/**
 * Gera embedding de uma string única (query do user). Atalho do batch.
 */
export async function generateEmbedding(
  text: string,
  apiKey: string,
): Promise<{ embedding: number[]; totalTokens: number }> {
  const { embeddings, totalTokens } = await generateEmbeddingsBatch(
    [text],
    apiKey,
  );
  return { embedding: embeddings[0], totalTokens };
}

export type ChunkRow = {
  id: string;
  source_kind: SourceKind;
  source_id: string;
  chunk_index: number;
  content: string;
  metadata: ChunkMetadata;
  similarity: number;
};

export { EMBEDDING_MODEL, EMBEDDING_DIMS, CHUNK_SIZE };

/**
 * Tipo estrutural mínimo aceito por `searchRelevantChunks`. Compatível
 * com `SupabaseClient` (createAdminClient) — apenas precisa do método
 * `rpc` que retorna um builder com `.then` (thenable).
 */
type RpcClient = {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: unknown }>;
};

/**
 * Busca semântica. Server-only — usa service_role pra rodar `search_content_embeddings`.
 * Retorna os top-K chunks mais relevantes pra `query` no escopo do user
 * (opcionalmente filtrado por subject e source_kind).
 */
export async function searchRelevantChunks(opts: {
  userId: string;
  query: string;
  subjectId?: string | null;
  sourceKind?: SourceKind;
  limit?: number;
  threshold?: number;
  /** Service-role Supabase client (createAdminClient). */
  supabaseAdmin: RpcClient;
  /** OpenAI API key */
  apiKey: string;
}): Promise<ChunkRow[]> {
  const { userId, query, subjectId, sourceKind, supabaseAdmin, apiKey } = opts;
  const limit = opts.limit ?? 5;
  const threshold = opts.threshold ?? 0.3;

  // 1. Embeda a query
  const { embedding } = await generateEmbedding(query, apiKey);

  // 2. Chama a função SQL search_content_embeddings
  const { data, error } = await supabaseAdmin.rpc(
    "search_content_embeddings",
    {
      query_embedding: embedding,
      user_id_input: userId,
      subject_id_input: subjectId ?? null,
      source_kind_input: sourceKind ?? null,
      match_threshold: threshold,
      match_count: limit,
    },
  );

  if (error) {
    console.error("[searchRelevantChunks] rpc failed", error);
    return [];
  }
  return Array.isArray(data) ? (data as ChunkRow[]) : [];
}
