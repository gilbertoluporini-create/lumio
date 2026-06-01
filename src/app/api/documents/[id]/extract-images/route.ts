/**
 * POST /api/documents/[id]/extract-images
 *
 * Feature Atlas (Wave 2 / B1): dispara extração background de imagens reais
 * de um PDF do user. Pra cada imagem extraída via `extractImagesFromPdf`:
 *
 *   1. Upload do binário pro bucket `pdf-extracted-images` no path
 *      `{userId}/{documentId}/p{page}-i{index}.{ext}`.
 *   2. Signed URL de 24h (renovada por job futuro quando expirar).
 *   3. Embedding OpenAI (`text-embedding-3-small`, 1536d) da caption capturada
 *      pelo extractor — quando não há caption, embedding fica null e o registro
 *      ainda é salvo pra navegação manual.
 *   4. INSERT em `pdf_extracted_images` com classification=null (B3 / job
 *      futuro classifica via Vision).
 *
 * Cruzamento com resumo educativo (consumido por B2/B3): o markdown gera
 * embeddings por seção e busca top-K imagens reais por cosine. IA fica como
 * fallback.
 *
 * Autenticação dupla:
 *  - Header `x-internal-key === CRON_SECRET` → modo worker (userId no body).
 *    Esse caminho é usado pelo onUploaded do dialog de upload e por futuras
 *    triggers automáticas (cron de batch reprocess, queue worker, etc).
 *  - Sessão Supabase (cookie) → user.id (modo client direto).
 *
 * Idempotência:
 *  - Se já existe row(s) em `pdf_extracted_images` pra o documentId, responde
 *    `{ok: true, alreadyProcessed: true, imageCount}` sem reprocessar.
 *  - Body `{force: true}` ignora o guard e reprocessa do zero (não apaga
 *    rows antigas — append-only; usar com cuidado).
 *
 * Limites:
 *  - Rate limit: 10 chamadas/hora por user.
 *  - Hard cap de 50 imagens por documento (defesa contra atlas gigantes).
 *  - Hard cap de 10 imagens/página (já é o default do extractor).
 *  - Concorrência: chunks de 5 uploads/embeddings em paralelo.
 *
 * Body opcional: { userId?: string, force?: boolean }
 * Response sucesso: {
 *   ok: true,
 *   imageCount: number,
 *   embeddingsGenerated: number,
 *   durationMs: number,
 *   estimatedCostUsd: number,
 *   alreadyProcessed?: true
 * }
 * Response erro: { ok: false, error: string, stage: "load"|"extract"|"upload"|"embed"|"insert" }
 */

import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { getClientIp, limitOrThrow } from "@/lib/rate-limit";
import { logAiUsage } from "@/lib/ai-usage";
import { LIMITS } from "@/lib/api-security";
import {
  extractImagesFromPdf,
  type ExtractedPdfImage,
} from "@/lib/pdf-image-extract";
import { generateEmbeddingsBatch } from "@/lib/embeddings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// PDFs grandes (Netter/Sobotta full) podem ter 50+ páginas com várias figs.
// pdfjs no Node é single-thread e cada página é 1-3s; +50 uploads chunked
// pra storage + embeddings batch. 5min cobre o pior caso com folga.
export const maxDuration = 300;

/** Stage do erro pra debugging — devolvido no body de erro. */
type ErrorStage = "load" | "extract" | "upload" | "embed" | "insert";

/** Hard cap defensivo contra atlas escaneados gigantes. */
const MAX_IMAGES_PER_DOC = 50;

/** Hard cap de páginas do PDF — atlas gigantes (>200 págs) são bloqueados
 *  antes do processamento pra evitar timeout e custo descontrolado. */
const MAX_PDF_PAGES = 200;

/** Validade do signed URL inicial: 24h. Jobs futuros renovam. */
const SIGNED_URL_TTL_SEC = 60 * 60 * 24;

/** Paralelismo de upload/insert por chunk. 5 cabe no I/O do Vercel
 *  sem saturar rede nem sockets do Supabase Storage. */
const CONCURRENCY = 5;

type DocumentRow = {
  id: string;
  user_id: string;
  source_kind: string | null;
  source_url: string | null;
};

type ExistingImageRow = {
  id: string;
};

type PdfImageInsert = {
  user_id: string;
  document_id: string;
  page_number: number;
  storage_path: string;
  // image_url é null no insert. Source of truth = storage_path; signed URL
  // é regenerada on-demand por /api/atlas/img/[id]. Persistir signed URL
  // gerava links mortos depois do TTL (24h) — fix de 2026-05-31.
  image_url: string | null;
  caption_text: string | null;
  classification: string | null;
  embedding: number[] | null;
  width: number;
  height: number;
};

type ParsedBody = {
  userId?: string;
  force?: boolean;
};

type ErrorResponse = { ok: false; error: string; stage: ErrorStage };

function errorResponse(
  stage: ErrorStage,
  error: string,
  status = 500,
): NextResponse<ErrorResponse> {
  return NextResponse.json({ ok: false, error, stage }, { status });
}

/**
 * Comparação de strings em tempo constante. Previne timing attack na
 * verificação do header `x-internal-key` (early-return char-a-char vazaria
 * o tamanho/prefixo válido do CRON_SECRET via medição de latência).
 */
function safeEq(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/**
 * Mapeia mimeType -> extensão usada no path do bucket. Defaults para 'png'
 * (formato emitido pelo encoder fallback do extractor).
 */
function extensionFor(mimeType: string): string {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/png") return "png";
  // Outros formatos não são produzidos hoje, mas tratamos defensivamente.
  if (mimeType === "image/webp") return "webp";
  return "png";
}

/**
 * Processa items em chunks paralelos. Mantém ordem do resultado.
 * Falhas individuais retornam null no slot — o caller decide se ignora ou
 * propaga (pra este endpoint, falha em uma imagem não trava as outras).
 */
async function mapChunked<T, R>(
  items: T[],
  size: number,
  fn: (item: T, index: number) => Promise<R | null>,
): Promise<Array<R | null>> {
  const out: Array<R | null> = new Array(items.length).fill(null);
  for (let i = 0; i < items.length; i += size) {
    const chunk = items.slice(i, i + size);
    const results = await Promise.all(
      chunk.map((it, j) => fn(it, i + j).catch((err) => {
        console.warn(
          `[extract-images] chunk item ${i + j} threw:`,
          (err as Error).message,
        );
        return null;
      })),
    );
    for (let j = 0; j < results.length; j++) {
      out[i + j] = results[j];
    }
  }
  return out;
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const startedAt = Date.now();
  const { id: documentId } = await ctx.params;
  if (!documentId) {
    return errorResponse("load", "Document id ausente.", 400);
  }

  // Auth dupla. Worker bypassa sessão via x-internal-key === CRON_SECRET e
  // manda userId no body. User logado usa cookie da sessão.
  const internalKey = req.headers.get("x-internal-key");
  const expectedInternalKey = process.env.CRON_SECRET ?? "";
  const isInternalCall = Boolean(
    internalKey &&
      expectedInternalKey &&
      safeEq(internalKey, expectedInternalKey),
  );

  let body: ParsedBody = {};
  try {
    body = (await req.json()) as ParsedBody;
  } catch {
    /* body vazio é OK — força = false, userId derivado do doc */
  }

  // Pra session user, precisamos do user.id pra confirmar ownership do doc
  // depois do lookup. Pra internal call, não precisamos de body.userId — o
  // userId é derivado de `doc.user_id` (single source of truth).
  let sessionUserId: string | null = null;
  if (!isInternalCall) {
    if (
      !process.env.NEXT_PUBLIC_SUPABASE_URL ||
      !process.env.SUPABASE_SERVICE_ROLE_KEY
    ) {
      return errorResponse("load", "Configuração de servidor incompleta.", 503);
    }
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return errorResponse("load", "Faça login.", 401);
    }
    sessionUserId = user.id;
  }

  // Rate limit: 10 chamadas/hora por user. Worker (internal) ignora — usado
  // só em fluxos controlados (pós-upload, cron de reprocess).
  if (!isInternalCall && sessionUserId) {
    const ip = getClientIp(req);
    const ipLimit = limitOrThrow(
      `extract-images:ip:${ip}`,
      20,
      60 * 60_000,
    );
    if (ipLimit) return ipLimit as NextResponse;
    const userLimit = limitOrThrow(
      `extract-images:user:${sessionUserId}`,
      10,
      60 * 60_000,
    );
    if (userLimit) return userLimit as NextResponse;
  }

  const openaiKey = process.env.OPENAI_API_KEY ?? "";
  if (!openaiKey) {
    console.warn(
      "[extract-images] OPENAI_API_KEY ausente — vou pular embeddings",
    );
  }

  const admin = createAdminClient();

  // 1) Valida ownership do documento. RLS já bloquearia no client, mas no
  //    admin client (service_role) precisamos checar à mão.
  const { data: docRaw, error: docErr } = await admin
    .from("documents")
    .select("id, user_id, source_kind, source_url")
    .eq("id", documentId)
    .maybeSingle();
  if (docErr) {
    console.error("[extract-images] lookup doc failed", docErr);
    return errorResponse("load", "Falha ao consultar documento.", 500);
  }
  const doc = docRaw as DocumentRow | null;
  if (!doc) {
    return errorResponse("load", "Documento não encontrado.", 404);
  }
  // FIX 7: derivar userId de doc.user_id depois do lookup. Pra session user,
  // confirma que o user logado é o dono (senão 404 sem revelar existência).
  // Pra internal call, simplesmente confia no doc.user_id (worker já provou
  // identidade via CRON_SECRET timing-safe). body.userId é ignorado: evita
  // confused-deputy/divergência entre body e DB.
  if (sessionUserId !== null && doc.user_id !== sessionUserId) {
    return errorResponse("load", "Documento não encontrado.", 404);
  }
  const userId = doc.user_id;
  if (doc.source_kind && doc.source_kind !== "pdf") {
    return errorResponse(
      "load",
      "Só PDFs suportam extração de imagens.",
      400,
    );
  }
  if (!doc.source_url) {
    return errorResponse(
      "load",
      "Documento sem arquivo no storage — re-suba o PDF.",
      400,
    );
  }

  // 2) Idempotência: se já tem rows pra esse doc, retorna o count sem
  //    reprocessar (a menos que force=true). RLS no admin é bypass, então
  //    eq("user_id") explícito como defesa em profundidade.
  if (!body.force) {
    const { data: existing, error: existingErr } = await admin
      .from("pdf_extracted_images")
      .select("id")
      .eq("document_id", documentId)
      .eq("user_id", userId)
      .limit(1);
    if (existingErr) {
      console.warn("[extract-images] idempotency check failed", existingErr);
    } else {
      const existingRows = (existing ?? []) as ExistingImageRow[];
      if (existingRows.length > 0) {
        // Conta total separadamente (head:true evita carregar rows).
        const { count } = await admin
          .from("pdf_extracted_images")
          .select("id", { count: "exact", head: true })
          .eq("document_id", documentId)
          .eq("user_id", userId);
        const imageCount = typeof count === "number" ? count : existingRows.length;
        console.log(
          `[extract-images] doc=${documentId} already processed (${imageCount} imgs) — skipping`,
        );
        return NextResponse.json({
          ok: true,
          alreadyProcessed: true,
          imageCount,
          embeddingsGenerated: 0,
          durationMs: Date.now() - startedAt,
          estimatedCostUsd: 0,
        });
      }
    }
  }

  // 3) Baixa o PDF do storage. source_url é a public URL do bucket
  //    user-documents — restringimos a URLs do nosso Supabase pra evitar
  //    SSRF caso source_url venha corrompido no DB.
  // FIX 3: prefix check exige `/` no fim do supaUrl. Sem a barra, um
  // subdomain attack tipo `https://abc.supabase.co.evil.com` passaria pelo
  // startsWith(supaUrl) quando supaUrl = `https://abc.supabase.co`.
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const supaUrlPrefix = supaUrl ? `${supaUrl.replace(/\/+$/, "")}/` : "";
  if (!supaUrlPrefix || !doc.source_url.startsWith(supaUrlPrefix)) {
    return errorResponse(
      "load",
      "source_url do documento não aponta pro storage do projeto.",
      400,
    );
  }
  let pdfBuffer: Buffer;
  try {
    const resp = await fetch(doc.source_url);
    if (!resp.ok) {
      return errorResponse(
        "load",
        `Storage respondeu ${resp.status} ao baixar PDF.`,
        502,
      );
    }
    // FIX 4: cap defensivo via Content-Length ANTES de buffer total. Evita
    // OOM/timeout se source_url for trocado por um arquivo gigante (ou se o
    // próprio storage retornar algo inesperado). Quando o header está
    // ausente caímos no check pós-buffer abaixo.
    const contentLength = Number(resp.headers.get("content-length") ?? 0);
    if (contentLength > LIMITS.PDF_BYTES) {
      return errorResponse(
        "load",
        `PDF muito grande: ${contentLength} bytes (limite ${LIMITS.PDF_BYTES}).`,
        413,
      );
    }
    const ab = await resp.arrayBuffer();
    if (ab.byteLength === 0) {
      return errorResponse("load", "Arquivo do PDF está vazio.", 400);
    }
    if (ab.byteLength > LIMITS.PDF_BYTES) {
      return errorResponse(
        "load",
        `PDF muito grande: ${ab.byteLength} bytes (limite ${LIMITS.PDF_BYTES}).`,
        413,
      );
    }
    pdfBuffer = Buffer.from(ab);
  } catch (err) {
    return errorResponse(
      "load",
      `Falha ao baixar PDF: ${(err as Error).message}`,
      502,
    );
  }
  console.log(
    `[extract-images] doc=${documentId} pdf baixado (${pdfBuffer.byteLength} bytes)`,
  );

  // 4) Extrai imagens. Não lança em erros internos do pdfjs — retorna o
  //    que conseguiu coletar. PDF sem imagens é success com imageCount=0.
  let extracted: ExtractedPdfImage[] = [];
  try {
    extracted = await extractImagesFromPdf(pdfBuffer);
  } catch (err) {
    return errorResponse(
      "extract",
      `Extração falhou: ${(err as Error).message}`,
      500,
    );
  }

  if (extracted.length === 0) {
    console.log(`[extract-images] doc=${documentId} sem imagens extraíveis`);
    return NextResponse.json({
      ok: true,
      imageCount: 0,
      embeddingsGenerated: 0,
      durationMs: Date.now() - startedAt,
      estimatedCostUsd: 0,
    });
  }

  // FIX 5: cap de páginas pós-extração. Se o PDF tiver mais de MAX_PDF_PAGES
  // páginas, rejeita antes do upload/embed/insert (PDF bomb defense + custo).
  // `extractImagesFromPdf` não aceita `maxTotal` na signature atual, então
  // o check é feito aqui — qualquer imagem com pageNumber > MAX_PDF_PAGES
  // indica que o doc é gigante demais pro pipeline.
  const maxPageObserved = extracted.reduce(
    (acc, e) => (e.pageNumber > acc ? e.pageNumber : acc),
    0,
  );
  if (maxPageObserved > MAX_PDF_PAGES) {
    return errorResponse(
      "extract",
      `PDF tem ${maxPageObserved} páginas — limite é ${MAX_PDF_PAGES}.`,
      413,
    );
  }

  // Hard cap total — defesa contra PDFs gigantes (atlas escaneado de 800
  // figuras). Mantém as primeiras N na ordem que apareceram (página asc).
  if (extracted.length > MAX_IMAGES_PER_DOC) {
    console.warn(
      `[extract-images] doc=${documentId} truncando ${extracted.length} -> ${MAX_IMAGES_PER_DOC} imgs`,
    );
    extracted = extracted.slice(0, MAX_IMAGES_PER_DOC);
  }

  console.log(
    `[extract-images] doc=${documentId} extraídas ${extracted.length} imgs`,
  );

  // 5) Upload em paralelo (chunked). Cada slot retorna { storagePath,
  //    signedUrl } ou null em caso de erro. Índice global mantido pra
  //    nomear arquivos consistentemente.
  type UploadOutcome = {
    storagePath: string;
    imageUrl: string;
    image: ExtractedPdfImage;
  };
  // FIX 1: pré-aloca storagePath SEQUENCIALMENTE antes do mapChunked. O
  // código antigo incrementava perPageCounter dentro do callback paralelo,
  // o que causava race: duas imagens da mesma página processadas no mesmo
  // chunk liam `pageIdx = 0` simultaneamente e gravavam o MESMO path
  // (p{page}-i0). Upload com upsert=true sobrescrevia, INSERT criava 2 rows
  // apontando pro mesmo arquivo físico — corrupção silenciosa da galeria.
  // Agora a allocation é determinística e pré-mapeia (image, storagePath).
  type Allocation = { image: ExtractedPdfImage; storagePath: string };
  const perPageCounter = new Map<number, number>();
  const allocations: Allocation[] = extracted.map((image) => {
    const pageIdx = perPageCounter.get(image.pageNumber) ?? 0;
    perPageCounter.set(image.pageNumber, pageIdx + 1);
    const ext = extensionFor(image.mimeType);
    return {
      image,
      storagePath: `${userId}/${documentId}/p${image.pageNumber}-i${pageIdx}.${ext}`,
    };
  });

  const uploads = await mapChunked<Allocation, UploadOutcome>(
    allocations,
    CONCURRENCY,
    async ({ image, storagePath }): Promise<UploadOutcome | null> => {
      const { error: upErr } = await admin.storage
        .from("pdf-extracted-images")
        .upload(storagePath, image.imageBuffer, {
          contentType: image.mimeType,
          upsert: true,
        });
      if (upErr) {
        console.warn(
          `[extract-images] upload falhou (${storagePath}):`,
          upErr.message ?? upErr,
        );
        return null;
      }

      const { data: signed, error: signErr } = await admin.storage
        .from("pdf-extracted-images")
        .createSignedUrl(storagePath, SIGNED_URL_TTL_SEC);
      if (signErr || !signed?.signedUrl) {
        console.warn(
          `[extract-images] signedUrl falhou (${storagePath}):`,
          signErr?.message,
        );
        // Não é fatal pro pipeline — guardamos vazio e o frontend pode
        // regerar via outro endpoint. Mas se não temos URL não vale a row.
        return null;
      }

      return {
        storagePath,
        imageUrl: signed.signedUrl,
        image,
      };
    },
  );

  const successful = uploads.filter(
    (u): u is UploadOutcome => u !== null,
  );

  if (successful.length === 0) {
    return errorResponse(
      "upload",
      "Nenhuma imagem conseguiu subir pro storage.",
      502,
    );
  }

  // 6) Gera embeddings em UM batch (OpenAI aceita N inputs por call —
  //    bem mais barato que N calls). Só pra imagens com caption não-vazia.
  const captionedIndices: number[] = [];
  const captionsForEmbed: string[] = [];
  successful.forEach((s, idx) => {
    const caption = s.image.caption?.trim() ?? "";
    if (caption.length > 0) {
      captionedIndices.push(idx);
      captionsForEmbed.push(caption);
    }
  });

  const embeddingsByIdx = new Map<number, number[]>();
  let totalEmbedTokens = 0;
  if (captionsForEmbed.length > 0 && openaiKey) {
    try {
      const result = await generateEmbeddingsBatch(captionsForEmbed, openaiKey);
      totalEmbedTokens = result.totalTokens;
      result.embeddings.forEach((emb, i) => {
        embeddingsByIdx.set(captionedIndices[i], emb);
      });
    } catch (err) {
      // Não trava o pipeline — captions ficam sem embedding e podem ser
      // re-embeddadas por job futuro. Loga pra observability.
      console.warn(
        "[extract-images] embeddings batch failed:",
        (err as Error).message,
      );
    }
  }

  // 7) INSERT em chunks. Postgres aceita batch insert, então fazemos um
  //    único call por chunk (menos round-trips que insert linha por linha).
  const rows: PdfImageInsert[] = successful.map((s, idx) => ({
    user_id: userId,
    document_id: documentId,
    page_number: s.image.pageNumber,
    storage_path: s.storagePath,
    // NÃO persistir signed URL: ela expira em 24h e deixa o resumo/galeria
    // com links mortos. Quem consome a imagem chama /api/atlas/img/[id] que
    // regenera signed URL fresca on-demand. A coluna fica nullable; rows
    // antigas (criadas antes do fix) continuam funcionando até a URL
    // gravada expirar (próximas 24h após geração — migration de cleanup
    // futura pode nullificar todas).
    image_url: null,
    caption_text: s.image.caption ?? null,
    classification: null,
    embedding: embeddingsByIdx.get(idx) ?? null,
    width: s.image.width,
    height: s.image.height,
  }));

  // FIX 6: rollback em insert parcial. Antes, se o chunk N+1 falhasse,
  // ficávamos com rows dos chunks 1..N órfãs no DB. Próxima chamada via
  // idempotency check enxergaria "já processado" e retornaria
  // alreadyProcessed=true com count incompleto — galeria mostraria menos
  // imagens do que existem e force=true seria a única saída. Solução
  // all-or-nothing: DELETE pelas (document_id, user_id) antes do
  // errorResponse. Trade-off conhecido: perde trabalho parcial bem-sucedido
  // (uploads no storage permanecem, mas como upsert=true reprocessar é seguro).
  let insertedCount = 0;
  try {
    for (let i = 0; i < rows.length; i += CONCURRENCY * 4) {
      const chunk = rows.slice(i, i + CONCURRENCY * 4);
      const { error: insErr, count } = await admin
        .from("pdf_extracted_images")
        .insert(chunk, { count: "exact" });
      if (insErr) {
        throw new Error(`chunk ${i}: ${insErr.message}`);
      }
      insertedCount += typeof count === "number" ? count : chunk.length;
    }
  } catch (insertErr) {
    const msg = (insertErr as Error).message;
    console.error(
      `[extract-images] insert falhou — iniciando rollback doc=${documentId}:`,
      msg,
    );
    // Best-effort rollback. Se o DELETE também falhar (raro), loga e segue
    // pro errorResponse 500 — o caller pode tentar de novo com force=true.
    // eq("user_id") como defesa em profundidade (admin client é bypass RLS).
    const { error: rollbackErr } = await admin
      .from("pdf_extracted_images")
      .delete()
      .eq("document_id", documentId)
      .eq("user_id", userId);
    if (rollbackErr) {
      console.error(
        `[extract-images] ROLLBACK falhou doc=${documentId}:`,
        rollbackErr.message,
      );
    }
    return errorResponse("insert", `INSERT falhou: ${msg}`, 500);
  }

  // 8) Log de uso AI — só faz sentido logar quando geramos embeddings.
  //    Custo per image é a soma das images_count que NÃO viraram embed (zero).
  //    Embeddings: ~$0.02/Mtok input → tokens vem do response da OpenAI.
  const embeddingsGenerated = embeddingsByIdx.size;
  if (totalEmbedTokens > 0) {
    void logAiUsage({
      userId,
      endpoint: "/api/documents/[id]/extract-images",
      model: "text-embedding-3-small",
      inputTokens: totalEmbedTokens,
      outputTokens: 0,
    }).catch(() => {});
  }

  // Custo USD estimado: só embeddings (extração + storage não tem custo
  // marginal por imagem aqui — storage do Supabase é cobrado por GB-mês
  // global, fora deste log).
  const estimatedCostUsd = Number(
    ((totalEmbedTokens / 1_000_000) * 0.02).toFixed(6),
  );

  const durationMs = Date.now() - startedAt;
  console.log(
    `[extract-images] doc=${documentId} done — ${insertedCount} rows, ${embeddingsGenerated} embeds, ${durationMs}ms, ~$${estimatedCostUsd}`,
  );

  return NextResponse.json({
    ok: true,
    imageCount: insertedCount,
    embeddingsGenerated,
    durationMs,
    estimatedCostUsd,
  });
}
