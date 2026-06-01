/**
 * Ingestão de PDF de atlas global pra tabela `atlas_global_images`.
 *
 * Atlas "global" = basal compartilhado entre TODOS os users (Sobotta, Netter,
 * Gray's…). Diferente de `pdf_extracted_images` (que é per-user). Este script
 * roda LOCAL na máquina do founder, com env vars de PROD, fala direto com
 * Supabase via service_role (bypass RLS).
 *
 * Uso:
 *   tsx scripts/ingest-atlas-pdf.ts <book_slug> <book_title> <pdf_path>
 *
 * Exemplo:
 *   tsx scripts/ingest-atlas-pdf.ts sobotta-v2 \
 *     "Sobotta Atlas of Human Anatomy Vol 2" ~/Downloads/sobotta-v2.pdf
 *
 * Pré-req:
 *   .env.local com NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + OPENAI_API_KEY
 *   Migration 039 aplicada (cria atlas_global_images + bucket atlas-global)
 *
 * Idempotência:
 *   Antes de upload/insert checa se storage_path já existe na tabela.
 *   Se sim, SKIP. Rodar 2x não duplica, não re-embedda, não re-uploada.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { extractImagesFromPdf } from "@/lib/pdf-image-extract";
import { generateEmbeddingsBatch } from "@/lib/embeddings";

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
    "[ingest-atlas-pdf] env faltando. Precisa de:\n" +
      "  NEXT_PUBLIC_SUPABASE_URL\n" +
      "  SUPABASE_SERVICE_ROLE_KEY\n" +
      "  OPENAI_API_KEY",
  );
  process.exit(1);
}

// ---- args ----
const [bookSlug, bookTitle, pdfPathArg] = process.argv.slice(2);
if (!bookSlug || !bookTitle || !pdfPathArg) {
  console.error(
    "Uso: tsx scripts/ingest-atlas-pdf.ts <book_slug> <book_title> <pdf_path>",
  );
  process.exit(1);
}
// Expande `~` manualmente — readFileSync não interpreta home dir.
const pdfPath = pdfPathArg.startsWith("~")
  ? resolve(process.env.HOME ?? "", pdfPathArg.slice(1).replace(/^\/+/, ""))
  : resolve(pdfPathArg);

// ---- admin client (bypass RLS) ----
const supabase = createSupabaseClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const BUCKET = "atlas-global";
const EMBED_BATCH_SIZE = 50; // OpenAI aceita até 2048; 50 dá folga e bom custo/latência

/** Tipo da linha que vamos inserir na tabela (subset usado aqui). */
type AtlasRow = {
  book_slug: string;
  book_title: string;
  page_number: number | null;
  storage_path: string;
  caption_text: string;
  classification: string | null;
  width: number;
  height: number;
  embedding: number[];
};

/**
 * Padroniza ext do mime que o extractor devolveu. PNG ou JPEG são as únicas
 * saídas possíveis do pdf-image-extract.
 */
function extFromMime(mime: string): "png" | "jpg" {
  return mime === "image/jpeg" ? "jpg" : "png";
}

async function storagePathExists(path: string): Promise<boolean> {
  // Checamos pela linha na tabela — fonte da verdade de "já ingerido".
  // (Checar bucket via storage list é mais lento e menos confiável.)
  const { data, error } = await supabase
    .from("atlas_global_images")
    .select("id")
    .eq("storage_path", path)
    .limit(1);
  if (error) {
    console.warn(`[skip-check] erro consultando ${path}:`, error.message);
    return false;
  }
  return Array.isArray(data) && data.length > 0;
}

async function main(): Promise<void> {
  console.log(`[ingest-atlas-pdf] livro: ${bookSlug} (${bookTitle})`);
  console.log(`[ingest-atlas-pdf] PDF: ${pdfPath}`);

  let buffer: Buffer;
  try {
    buffer = readFileSync(pdfPath);
  } catch (err) {
    console.error(`PDF não pôde ser lido: ${(err as Error).message}`);
    process.exit(1);
  }

  console.log(`[ingest-atlas-pdf] extraindo imagens do PDF…`);
  const images = await extractImagesFromPdf(buffer);
  console.log(`[ingest-atlas-pdf] ${images.length} imagens extraídas`);

  if (images.length === 0) {
    console.log("Nada pra ingerir.");
    return;
  }

  // Numera por página: dentro de cada página, ordem do extractor é a do PDF.
  type Indexed = (typeof images)[number] & { perPageIdx: number };
  const counters = new Map<number, number>();
  const indexed: Indexed[] = images.map((img) => {
    const next = (counters.get(img.pageNumber) ?? 0) + 1;
    counters.set(img.pageNumber, next);
    return { ...img, perPageIdx: next };
  });

  // Captions com fallback. Embeddings vêm desses textos.
  const captions: string[] = indexed.map(
    (img) => img.caption?.trim() || `Página ${img.pageNumber} de ${bookTitle}`,
  );

  // ---- embeddings em batch de 50 ----
  console.log(
    `[ingest-atlas-pdf] gerando embeddings (batches de ${EMBED_BATCH_SIZE})…`,
  );
  const embeddings: number[][] = new Array(captions.length);
  for (let i = 0; i < captions.length; i += EMBED_BATCH_SIZE) {
    const slice = captions.slice(i, i + EMBED_BATCH_SIZE);
    try {
      const { embeddings: batch } = await generateEmbeddingsBatch(
        slice,
        OPENAI_API_KEY as string,
      );
      for (let j = 0; j < batch.length; j++) {
        embeddings[i + j] = batch[j];
      }
      console.log(
        `  embed batch ${Math.floor(i / EMBED_BATCH_SIZE) + 1} ok (${slice.length} captions)`,
      );
    } catch (err) {
      console.error(
        `  embed batch ${i / EMBED_BATCH_SIZE + 1} falhou:`,
        (err as Error).message,
      );
      // Preenche com null pra pular esses itens depois.
      for (let j = 0; j < slice.length; j++) {
        // @ts-expect-error marcador de falha (sentinela); checado abaixo
        embeddings[i + j] = null;
      }
    }
  }

  // ---- upload + insert ----
  let processed = 0;
  let inserted = 0;
  let skipped = 0;
  let errored = 0;
  const total = indexed.length;

  for (let i = 0; i < total; i++) {
    processed++;
    const img = indexed[i];
    const ext = extFromMime(img.mimeType);
    const filename = `page-${String(img.pageNumber).padStart(3, "0")}-img-${String(
      img.perPageIdx,
    ).padStart(2, "0")}.${ext}`;
    const storagePath = `${bookSlug}/${filename}`;

    const tag = `[${processed}/${total}] page ${img.pageNumber}`;

    // Idempotência: já ingerido? pula.
    const exists = await storagePathExists(storagePath);
    if (exists) {
      console.log(`${tag} · skip (já existe ${storagePath})`);
      skipped++;
      continue;
    }

    const emb = embeddings[i];
    if (!emb || !Array.isArray(emb) || emb.length === 0) {
      console.warn(`${tag} · sem embedding válido — pulando`);
      errored++;
      continue;
    }

    // Upload pro Storage.
    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, img.imageBuffer, {
        contentType: img.mimeType,
        upsert: false,
      });
    if (upErr) {
      console.warn(`${tag} · upload falhou: ${upErr.message}`);
      errored++;
      continue;
    }

    // Insert na tabela.
    const row: AtlasRow = {
      book_slug: bookSlug,
      book_title: bookTitle,
      page_number: img.pageNumber,
      storage_path: storagePath,
      caption_text: captions[i],
      classification: null,
      width: img.width,
      height: img.height,
      embedding: emb,
    };
    const { error: insErr } = await supabase
      .from("atlas_global_images")
      .insert(row);
    if (insErr) {
      console.warn(`${tag} · insert falhou: ${insErr.message}`);
      // Tenta limpar o blob órfão pra manter consistência idempotente.
      await supabase.storage.from(BUCKET).remove([storagePath]).catch(() => {});
      errored++;
      continue;
    }

    inserted++;
    console.log(`${tag} · captured (${storagePath})`);
  }

  console.log("");
  console.log("=== resumo ===");
  console.log(`processadas: ${processed}`);
  console.log(`inseridas:   ${inserted}`);
  console.log(`puladas:     ${skipped}`);
  console.log(`erros:       ${errored}`);
}

main().catch((err) => {
  console.error("[ingest-atlas-pdf] fatal:", err);
  process.exit(1);
});
