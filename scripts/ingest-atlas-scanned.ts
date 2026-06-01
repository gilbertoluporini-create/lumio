/**
 * Ingestão de PDFs ESCANEADOS pra `atlas_global_images`.
 *
 * Variante do `ingest-atlas-pdf.ts` pra atlas onde cada página é uma imagem
 * raster (Sobotta scan, Netter scan). Não tem XObject pra extrair — temos que:
 *   1. Renderizar a página inteira como PNG alta resolução (canvas).
 *   2. Pedir pro GPT-4o Vision detectar bbox + caption + classificação de
 *      CADA ilustração distinta da página (JSON estruturado).
 *   3. Cropar cada ilustração com `sharp` baseado na bbox.
 *   4. Filtrar crops obviamente ruins (muito pequenos / página inteira).
 *   5. Embedar caption, upload pro bucket, INSERT na tabela. Tudo idempotente
 *      (pula página se já tem qualquer row daquela book_slug+page_number).
 *
 * Uso:
 *   tsx scripts/ingest-atlas-scanned.ts <book_slug> <book_title> <pdf_path> \
 *     [--start=N] [--end=N] [--dry-run]
 *
 * Exemplo:
 *   tsx scripts/ingest-atlas-scanned.ts sobotta-v2-scan \
 *     "Sobotta Atlas Vol 2 (scan)" ~/Downloads/sobotta-v2.pdf \
 *     --start=1 --end=50
 *
 * Pré-req:
 *   .env.local com NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + OPENAI_API_KEY
 *   Migration 039 aplicada (atlas_global_images + bucket atlas-global)
 *
 * Custo aproximado:
 *   Vision (GPT-4o, ~1800px PNG) ~$0.02/página. Sobotta vol 2 (~600 pgs) ≈ $12.
 *   Embeddings (text-embedding-3-small) negligível, < $0.05.
 *
 * Idempotência:
 *   Antes de processar página N, conta rows de (book_slug, page_number=N).
 *   Se > 0, SKIP a página. Permite retomar com --start=X sem custo dobrado.
 *
 * Robustez:
 *   - Try/catch em cada página. Erro numa página NÃO derruba o script.
 *   - Checkpoint append em /tmp/lumio-ingest-{book_slug}.log com 1 linha por
 *     página processada (pra auditar/debug depois).
 *   - Sequencial (1 página por vez) pra não estourar rate limit OpenAI Vision.
 */

import { appendFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { createMessage } from "@/lib/llm-fallback";
import { generateEmbedding } from "@/lib/embeddings";

// ---- bootstrap env (sem dep dotenv) ----
function loadEnvLocal(): void {
  try {
    const envPath = resolve(process.cwd(), ".env.local");
    const content = readFileSync(envPath, "utf8");
    for (const line of content.split("\n")) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    }
  } catch {
    // sem .env.local → segue só com env do shell
  }
}
loadEnvLocal();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE || !OPENAI_API_KEY) {
  console.error(
    "[ingest-atlas-scanned] env faltando. Precisa de:\n" +
      "  NEXT_PUBLIC_SUPABASE_URL\n" +
      "  SUPABASE_SERVICE_ROLE_KEY\n" +
      "  OPENAI_API_KEY",
  );
  process.exit(1);
}

// ---- args ----
type CliArgs = {
  bookSlug: string;
  bookTitle: string;
  pdfPath: string;
  start: number | null;
  end: number | null;
  dryRun: boolean;
};

function parseArgs(): CliArgs {
  const argv = process.argv.slice(2);
  const positional: string[] = [];
  let start: number | null = null;
  let end: number | null = null;
  let dryRun = false;
  for (const raw of argv) {
    if (raw === "--dry-run") {
      dryRun = true;
    } else if (raw.startsWith("--start=")) {
      const n = Number(raw.slice("--start=".length));
      if (!Number.isFinite(n) || n < 1) {
        console.error("--start precisa ser inteiro >= 1");
        process.exit(1);
      }
      start = Math.floor(n);
    } else if (raw.startsWith("--end=")) {
      const n = Number(raw.slice("--end=".length));
      if (!Number.isFinite(n) || n < 1) {
        console.error("--end precisa ser inteiro >= 1");
        process.exit(1);
      }
      end = Math.floor(n);
    } else if (raw.startsWith("--")) {
      console.error(`flag desconhecida: ${raw}`);
      process.exit(1);
    } else {
      positional.push(raw);
    }
  }
  const [bookSlug, bookTitle, pdfPathArg] = positional;
  if (!bookSlug || !bookTitle || !pdfPathArg) {
    console.error(
      "Uso: tsx scripts/ingest-atlas-scanned.ts <book_slug> <book_title> <pdf_path> [--start=N] [--end=N] [--dry-run]",
    );
    process.exit(1);
  }
  // Expande `~` manualmente.
  const pdfPath = pdfPathArg.startsWith("~")
    ? resolve(process.env.HOME ?? "", pdfPathArg.slice(1).replace(/^\/+/, ""))
    : resolve(pdfPathArg);
  return { bookSlug, bookTitle, pdfPath, start, end, dryRun };
}

const args = parseArgs();

// ---- admin client (bypass RLS) ----
const supabase = createSupabaseClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const BUCKET = "atlas-global";
/** Largura-alvo do render. ~1800px é o sweet spot: detalhe suficiente pra
 *  Vision identificar ilustrações sem dobrar custo de token de imagem. */
const RENDER_TARGET_WIDTH = 1800;
/** Crop menor que isso (qualquer dimensão) é quase sempre falso positivo
 *  (selo, número de página, decoração). Skip. */
const MIN_CROP_DIM_PX = 200;
/** Crop com área > 90% da página geralmente é Vision pegando "tudo" — sem
 *  granularidade útil pra busca. Skip. */
const MAX_CROP_AREA_RATIO = 0.9;
/** Custo estimado por chamada Vision pra log final. */
const VISION_COST_PER_PAGE_USD = 0.02;

const CHECKPOINT_PATH = `/tmp/lumio-ingest-${args.bookSlug}.log`;

function checkpoint(line: string): void {
  try {
    appendFileSync(CHECKPOINT_PATH, `${new Date().toISOString()} ${line}\n`);
  } catch {
    // checkpoint best-effort
  }
}

/* ------------------------------------------------------------------ */
/*  PDF render via pdfjs + @napi-rs/canvas                             */
/* ------------------------------------------------------------------ */

type PdfViewport = {
  width: number;
  height: number;
};
type PdfRenderPage = {
  getViewport: (opts: { scale: number }) => PdfViewport;
  render: (opts: {
    canvasContext: unknown;
    viewport: PdfViewport;
    canvas?: unknown;
  }) => { promise: Promise<void> };
  cleanup: () => void;
};
type PdfRenderDocument = {
  numPages: number;
  getPage: (n: number) => Promise<PdfRenderPage>;
  destroy: () => Promise<void>;
};
type PdfjsModule = {
  getDocument: (params: Record<string, unknown>) => {
    promise: Promise<PdfRenderDocument>;
  };
  GlobalWorkerOptions?: { workerSrc?: string };
};

/** Carrega lazy pra ficar fora do hot path em --dry-run sem PDF. */
async function loadPdfjs(): Promise<PdfjsModule> {
  const mod = (await import(
    "pdfjs-dist/legacy/build/pdf.mjs"
  )) as unknown as PdfjsModule;
  if (mod.GlobalWorkerOptions) {
    // pdfjs 5.x exige workerSrc setado mesmo em Node. Aponta pro arquivo
    // local via file:// URL (string vazia faz pdfjs jogar "fake worker
    // failed").
    const { pathToFileURL } = await import("node:url");
    const { createRequire } = await import("node:module");
    const req = createRequire(import.meta.url);
    const workerPath = req.resolve("pdfjs-dist/legacy/build/pdf.worker.mjs");
    mod.GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).href;
  }
  return mod;
}

type NapiCanvasMod = {
  createCanvas: (
    w: number,
    h: number,
  ) => {
    getContext: (kind: "2d") => unknown;
    width: number;
    height: number;
    encode: (fmt: "png") => Promise<Buffer>;
  };
};

async function loadCanvas(): Promise<NapiCanvasMod> {
  return (await import("@napi-rs/canvas")) as unknown as NapiCanvasMod;
}

/**
 * Renderiza uma página do PDF como PNG buffer, escalando pra ~RENDER_TARGET_WIDTH px
 * de largura. Devolve buffer + dimensões finais.
 */
async function renderPdfPageToPng(
  doc: PdfRenderDocument,
  canvasMod: NapiCanvasMod,
  pageNumber: number,
): Promise<{ buffer: Buffer; width: number; height: number }> {
  const page = await doc.getPage(pageNumber);
  try {
    const baseViewport = page.getViewport({ scale: 1 });
    const scale = Math.min(RENDER_TARGET_WIDTH / baseViewport.width, 3);
    const viewport = page.getViewport({ scale });
    const width = Math.floor(viewport.width);
    const height = Math.floor(viewport.height);
    const canvas = canvasMod.createCanvas(width, height);
    const ctx = canvas.getContext("2d") as {
      fillStyle: string;
      fillRect: (x: number, y: number, w: number, h: number) => void;
    };
    // Background branco — alguns PDFs renderizam transparente onde não há tinta.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    await page.render({
      canvasContext: ctx,
      viewport,
      canvas,
    }).promise;
    const buffer = await canvas.encode("png");
    return { buffer, width, height };
  } finally {
    try {
      page.cleanup();
    } catch {
      // ignore
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Vision call                                                        */
/* ------------------------------------------------------------------ */

type IllustrationDetection = {
  bbox: { x: number; y: number; width: number; height: number };
  caption_pt: string;
  classification: string;
};

const VISION_PROMPT = `Você está analisando uma página escaneada de um atlas anatômico médico.
Identifique CADA ilustração distinta (cortes anatômicos, desenhos, imagens de exame, fotografias).
IGNORE texto puro, números de página, decorações, e tabelas sem ilustração.
Retorne SOMENTE JSON válido neste formato exato:
{
  "illustrations": [
    {
      "bbox": { "x": 0.0, "y": 0.0, "width": 0.0, "height": 0.0 },
      "caption_pt": "descrição em pt-BR, max 200 chars, focada no que é mostrado",
      "classification": "anatomy" | "histology" | "imaging" | "other"
    }
  ]
}
bbox em coordenadas NORMALIZADAS (0..1) relativas à página inteira.
Se não houver nenhuma ilustração, retorne {"illustrations":[]}.`;

/** Extrai JSON do texto retornado pelo modelo (tolera ```json fences``` ou prefixo). */
function extractJson(text: string): unknown | null {
  const trimmed = text.trim();
  // tira fence markdown
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  const candidate = fenced ? fenced[1] : trimmed;
  // localiza primeiro `{` e último `}` por segurança
  const first = candidate.indexOf("{");
  const last = candidate.lastIndexOf("}");
  if (first < 0 || last <= first) return null;
  const slice = candidate.slice(first, last + 1);
  try {
    return JSON.parse(slice);
  } catch {
    return null;
  }
}

/** Validação leve da forma retornada pelo Vision. */
function isValidDetection(raw: unknown): raw is IllustrationDetection {
  if (!raw || typeof raw !== "object") return false;
  const r = raw as Record<string, unknown>;
  const b = r.bbox as Record<string, unknown> | undefined;
  if (!b) return false;
  const fields = ["x", "y", "width", "height"] as const;
  for (const f of fields) {
    if (typeof b[f] !== "number" || !Number.isFinite(b[f])) return false;
  }
  if (typeof r.caption_pt !== "string") return false;
  if (typeof r.classification !== "string") return false;
  return true;
}

const VALID_CLASSIFICATIONS = new Set([
  "anatomy",
  "histology",
  "imaging",
  "other",
]);

async function detectIllustrations(
  pngBuffer: Buffer,
): Promise<IllustrationDetection[]> {
  const base64 = pngBuffer.toString("base64");
  // 1 retry em caso de JSON inválido.
  for (let attempt = 1; attempt <= 2; attempt++) {
    let raw: string;
    try {
      const msg = await createMessage({
        // O fallback ignora `model` no caminho OpenAI (usa OPENAI_TEXT_MODEL,
        // default gpt-4.1, que aceita visão). Anthropic recebe esse hint mas
        // o caso esperado é o fallback OpenAI tomar conta.
        model: "claude-opus-4-5",
        max_tokens: 2000,
        temperature: 0,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: "image/png",
                  data: base64,
                },
              },
              { type: "text", text: VISION_PROMPT },
            ],
          },
        ],
      });
      const block = msg.content.find((c) => c.type === "text");
      raw = block && block.type === "text" ? block.text : "";
    } catch (err) {
      console.warn(
        `  vision tentativa ${attempt} falhou:`,
        (err as Error).message,
      );
      if (attempt === 2) return [];
      continue;
    }
    const parsed = extractJson(raw);
    if (
      parsed &&
      typeof parsed === "object" &&
      Array.isArray((parsed as { illustrations?: unknown }).illustrations)
    ) {
      const arr = (parsed as { illustrations: unknown[] }).illustrations;
      const out: IllustrationDetection[] = [];
      for (const item of arr) {
        if (!isValidDetection(item)) continue;
        const cls = VALID_CLASSIFICATIONS.has(item.classification)
          ? item.classification
          : "other";
        out.push({
          bbox: item.bbox,
          caption_pt: item.caption_pt.slice(0, 200).trim(),
          classification: cls,
        });
      }
      return out;
    }
    if (attempt === 1) {
      console.warn("  JSON inválido do Vision; retry…");
    }
  }
  return [];
}

/* ------------------------------------------------------------------ */
/*  Sharp crop                                                         */
/* ------------------------------------------------------------------ */

type SharpModule = {
  default: (input: Buffer) => SharpInstance;
};
type SharpInstance = {
  extract: (opts: {
    left: number;
    top: number;
    width: number;
    height: number;
  }) => SharpInstance;
  png: () => SharpInstance;
  toBuffer: () => Promise<Buffer>;
};

async function loadSharp(): Promise<SharpModule> {
  return (await import("sharp")) as unknown as SharpModule;
}

/**
 * Calcula coords pixel a partir de bbox normalizada, clampa nos limites da
 * página, e devolve null se o crop violar regras de qualidade.
 */
function plannedCrop(
  bbox: IllustrationDetection["bbox"],
  pageW: number,
  pageH: number,
): { left: number; top: number; width: number; height: number } | null {
  // Clamp normalizado
  const nx = Math.max(0, Math.min(1, bbox.x));
  const ny = Math.max(0, Math.min(1, bbox.y));
  const nw = Math.max(0, Math.min(1 - nx, bbox.width));
  const nh = Math.max(0, Math.min(1 - ny, bbox.height));

  const left = Math.floor(nx * pageW);
  const top = Math.floor(ny * pageH);
  const width = Math.floor(nw * pageW);
  const height = Math.floor(nh * pageH);

  if (width < MIN_CROP_DIM_PX || height < MIN_CROP_DIM_PX) return null;
  const areaRatio = (width * height) / (pageW * pageH);
  if (areaRatio > MAX_CROP_AREA_RATIO) return null;
  // Guarda contra overflow numérico improvável
  if (left + width > pageW || top + height > pageH) return null;
  return { left, top, width, height };
}

async function cropPng(
  sharpMod: SharpModule,
  pagePng: Buffer,
  rect: { left: number; top: number; width: number; height: number },
): Promise<Buffer> {
  return sharpMod
    .default(pagePng)
    .extract(rect)
    .png()
    .toBuffer();
}

/* ------------------------------------------------------------------ */
/*  Idempotência                                                       */
/* ------------------------------------------------------------------ */

async function pageAlreadyIngested(
  bookSlug: string,
  pageNumber: number,
): Promise<boolean> {
  const { count, error } = await supabase
    .from("atlas_global_images")
    .select("id", { count: "exact", head: true })
    .eq("book_slug", bookSlug)
    .eq("page_number", pageNumber);
  if (error) {
    console.warn(`  skip-check erro p.${pageNumber}: ${error.message}`);
    return false;
  }
  return (count ?? 0) > 0;
}

/* ------------------------------------------------------------------ */
/*  Main                                                               */
/* ------------------------------------------------------------------ */

async function main(): Promise<void> {
  console.log(
    `[ingest-atlas-scanned] livro: ${args.bookSlug} (${args.bookTitle})`,
  );
  console.log(`[ingest-atlas-scanned] PDF: ${args.pdfPath}`);
  if (args.dryRun) console.log("[ingest-atlas-scanned] DRY RUN — sem upload/insert");

  let buffer: Buffer;
  try {
    buffer = readFileSync(args.pdfPath);
  } catch (err) {
    console.error(`PDF não pôde ser lido: ${(err as Error).message}`);
    process.exit(1);
  }

  const [pdfjs, canvasMod, sharpMod] = await Promise.all([
    loadPdfjs(),
    loadCanvas(),
    loadSharp(),
  ]);

  let doc: PdfRenderDocument;
  try {
    const task = pdfjs.getDocument({
      data: new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength),
      isEvalSupported: false,
      disableFontFace: true,
      useSystemFonts: false,
      verbosity: 0,
    });
    doc = await task.promise;
  } catch (err) {
    console.error(`Falha ao abrir PDF: ${(err as Error).message}`);
    process.exit(1);
  }

  const totalPages = doc.numPages;
  const startPage = args.start ?? 1;
  const endPage = Math.min(args.end ?? totalPages, totalPages);
  if (startPage > endPage) {
    console.error(`Range vazio: start=${startPage} end=${endPage}`);
    process.exit(1);
  }
  console.log(
    `[ingest-atlas-scanned] páginas ${startPage}..${endPage} de ${totalPages}`,
  );

  let totalIllustrations = 0;
  let totalUploaded = 0;
  let totalSkippedCrop = 0;
  let totalErrored = 0;
  let pagesProcessed = 0;
  let visionCalls = 0;

  for (let pageNum = startPage; pageNum <= endPage; pageNum++) {
    const tag = `[p${pageNum}/${endPage}]`;
    try {
      // Idempotência: pula página se já tem qualquer row.
      if (!args.dryRun) {
        const exists = await pageAlreadyIngested(args.bookSlug, pageNum);
        if (exists) {
          console.log(`${tag} skip (já ingerida)`);
          checkpoint(`page=${pageNum} skip=already-ingested`);
          continue;
        }
      }

      // 1. Render
      const { buffer: pagePng, width: pageW, height: pageH } =
        await renderPdfPageToPng(doc, canvasMod, pageNum);

      // 2. Vision
      visionCalls++;
      const detections = await detectIllustrations(pagePng);

      let uploadedThisPage = 0;
      let skippedThisPage = 0;
      let erroredThisPage = 0;

      for (let i = 0; i < detections.length; i++) {
        const det = detections[i];
        const rect = plannedCrop(det.bbox, pageW, pageH);
        if (!rect) {
          skippedThisPage++;
          continue;
        }

        const perPageIdx = uploadedThisPage + 1;
        const filename = `p${String(pageNum).padStart(3, "0")}-i${String(
          perPageIdx,
        ).padStart(2, "0")}.png`;
        const storagePath = `${args.bookSlug}/${filename}`;

        if (args.dryRun) {
          console.log(
            `${tag}   would upload ${storagePath} (${rect.width}x${rect.height}) [${det.classification}] ${det.caption_pt.slice(0, 60)}…`,
          );
          uploadedThisPage++;
          continue;
        }

        let cropBuf: Buffer;
        try {
          cropBuf = await cropPng(sharpMod, pagePng, rect);
        } catch (err) {
          console.warn(
            `${tag}   crop falhou (idx=${i}): ${(err as Error).message}`,
          );
          erroredThisPage++;
          continue;
        }

        // Embedding da caption (texto curto, custo desprezível).
        let embedding: number[];
        try {
          const { embedding: emb } = await generateEmbedding(
            det.caption_pt || `${args.bookTitle} página ${pageNum}`,
            OPENAI_API_KEY as string,
          );
          embedding = emb;
        } catch (err) {
          console.warn(
            `${tag}   embedding falhou (idx=${i}): ${(err as Error).message}`,
          );
          erroredThisPage++;
          continue;
        }

        const { error: upErr } = await supabase.storage
          .from(BUCKET)
          .upload(storagePath, cropBuf, {
            contentType: "image/png",
            upsert: false,
          });
        if (upErr) {
          console.warn(
            `${tag}   upload falhou (${storagePath}): ${upErr.message}`,
          );
          erroredThisPage++;
          continue;
        }

        const { error: insErr } = await supabase
          .from("atlas_global_images")
          .insert({
            book_slug: args.bookSlug,
            book_title: args.bookTitle,
            page_number: pageNum,
            storage_path: storagePath,
            caption_text:
              det.caption_pt ||
              `${args.bookTitle} página ${pageNum}`,
            classification: det.classification,
            width: rect.width,
            height: rect.height,
            embedding,
          });
        if (insErr) {
          console.warn(
            `${tag}   insert falhou (${storagePath}): ${insErr.message}`,
          );
          // Limpa blob órfão pra manter idempotência.
          await supabase.storage
            .from(BUCKET)
            .remove([storagePath])
            .catch(() => {});
          erroredThisPage++;
          continue;
        }

        uploadedThisPage++;
      }

      totalIllustrations += detections.length;
      totalUploaded += uploadedThisPage;
      totalSkippedCrop += skippedThisPage;
      totalErrored += erroredThisPage;
      pagesProcessed++;

      console.log(
        `${tag} vision: ${detections.length} illustrations · upload: ${uploadedThisPage} · skip: ${skippedThisPage} · err: ${erroredThisPage}`,
      );
      checkpoint(
        `page=${pageNum} vision=${detections.length} upload=${uploadedThisPage} skip=${skippedThisPage} err=${erroredThisPage}`,
      );
    } catch (err) {
      totalErrored++;
      console.warn(`${tag} erro fatal na página: ${(err as Error).message}`);
      checkpoint(`page=${pageNum} fatal=${(err as Error).message}`);
      // segue pra próxima página
    }
  }

  try {
    await doc.destroy();
  } catch {
    // ignore
  }

  const estCost = visionCalls * VISION_COST_PER_PAGE_USD;
  console.log("");
  console.log("=== resumo ===");
  console.log(`páginas processadas: ${pagesProcessed}`);
  console.log(`ilustrações detectadas: ${totalIllustrations}`);
  console.log(`uploads: ${totalUploaded}`);
  console.log(`skip (crop ruim): ${totalSkippedCrop}`);
  console.log(`erros: ${totalErrored}`);
  console.log(`vision calls: ${visionCalls}`);
  console.log(`custo estimado: ~$${estCost.toFixed(2)}`);
  console.log(`checkpoint: ${CHECKPOINT_PATH}`);
}

main().catch((err) => {
  console.error("[ingest-atlas-scanned] fatal:", err);
  process.exit(1);
});
