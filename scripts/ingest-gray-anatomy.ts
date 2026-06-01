/**
 * Ingestão do Gray's Anatomy (1918) via Wikimedia Commons.
 *
 * Por que Wikimedia: a edição 1918 do Gray's Anatomy é domínio público e tem
 * uma categoria oficial em Commons com TODAS as pranchas escaneadas:
 *   https://commons.wikimedia.org/wiki/Category:Gray%27s_Anatomy_plates
 *
 * Por que esse script existe (e não ingest-atlas-pdf): Commons já normalizou
 * captions, tamanhos e formatos. Faz sentido puxar daí em vez de tentar OCR
 * de scans de PDF do Internet Archive.
 *
 * Estimativa: ~1.247 imagens (Tabela de Conteúdo do Gray's 1918, edição
 * Bartleby, lista 1247 figuras numeradas). Commons tem essencialmente todas;
 * algumas são SVG (vetorizadas modernas — vamos pular) ou variantes.
 *
 * Uso:
 *   tsx scripts/ingest-gray-anatomy.ts
 *
 * Idempotência: SELECT por storage_path antes de upload+insert.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { generateEmbedding } from "@/lib/embeddings";

// ---- bootstrap env ----
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
    // sem .env.local → ok
  }
}
loadEnvLocal();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE || !OPENAI_API_KEY) {
  console.error(
    "[ingest-gray-anatomy] env faltando. Precisa de:\n" +
      "  NEXT_PUBLIC_SUPABASE_URL\n" +
      "  SUPABASE_SERVICE_ROLE_KEY\n" +
      "  OPENAI_API_KEY",
  );
  process.exit(1);
}

// ---- constantes do livro ----
const BOOK_SLUG = "grays-1918";
const BOOK_TITLE = "Gray's Anatomy of the Human Body 1918";
const CATEGORY = "Category:Gray's_Anatomy_plates";
const BUCKET = "atlas-global";
// Wikimedia exige UA não-default. Identifica o app + email de contato.
const USER_AGENT = "Lumio-Atlas-Ingest/1.0 (contato@lumioapp.net)";
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

const supabase = createSupabaseClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ---- tipos da Wikimedia API ----
type CategoryMember = { pageid: number; ns: number; title: string };
type CategoryQueryResp = {
  query?: { categorymembers?: CategoryMember[] };
  continue?: { cmcontinue?: string };
};
type ImageInfoEntry = {
  url: string;
  size?: number;
  width?: number;
  height?: number;
  mime?: string;
  extmetadata?: {
    ImageDescription?: { value?: string };
    ObjectName?: { value?: string };
  };
};
type ImageInfoPage = { pageid: number; title: string; imageinfo?: ImageInfoEntry[] };
type ImageInfoResp = { query?: { pages?: Record<string, ImageInfoPage> } };

async function wmFetch<T>(url: string): Promise<T> {
  const resp = await fetch(url, { headers: { "user-agent": USER_AGENT } });
  if (!resp.ok) {
    throw new Error(`Wikimedia ${resp.status}: ${await resp.text()}`);
  }
  return (await resp.json()) as T;
}

/**
 * Pagina por TODOS os arquivos da categoria via cmcontinue.
 */
async function listCategoryFiles(): Promise<CategoryMember[]> {
  const all: CategoryMember[] = [];
  let cont: string | undefined;
  let pageIdx = 0;
  while (true) {
    pageIdx++;
    const params = new URLSearchParams({
      action: "query",
      list: "categorymembers",
      cmtitle: CATEGORY,
      cmlimit: "500",
      cmtype: "file",
      format: "json",
    });
    if (cont) params.set("cmcontinue", cont);
    const url = `https://commons.wikimedia.org/w/api.php?${params.toString()}`;
    const json = await wmFetch<CategoryQueryResp>(url);
    const members = json.query?.categorymembers ?? [];
    all.push(...members);
    console.log(`  página ${pageIdx}: +${members.length} (total ${all.length})`);
    cont = json.continue?.cmcontinue;
    if (!cont) break;
  }
  return all;
}

/**
 * Strip HTML pra texto puro. Wikimedia entrega descrição como HTML com
 * tags `<p>`, `<i>`, `<a>` etc. Pra embedding queremos só o texto.
 */
function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Sanitiza filename: remove "File:" prefix + chars que confundem o Storage.
 * Mantém ext original baixada (jpg/png).
 */
function sanitizeFilename(title: string): string {
  const noPrefix = title.replace(/^File:/i, "");
  const noExt = noPrefix.replace(/\.[a-z0-9]+$/i, "");
  return noExt
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 150)
    .toLowerCase();
}

function extFromMime(mime?: string): "jpg" | "png" | "svg" | "other" {
  if (!mime) return "other";
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/png") return "png";
  if (mime === "image/svg+xml") return "svg";
  return "other";
}

async function storagePathExists(path: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("atlas_global_images")
    .select("id")
    .eq("storage_path", path)
    .limit(1);
  if (error) {
    console.warn(`[skip-check] ${path}: ${error.message}`);
    return false;
  }
  return Array.isArray(data) && data.length > 0;
}

/**
 * Resolve metadata + URL pra UM arquivo. Faz uma chamada por arquivo —
 * mais lento que batch, mas API só aceita até 50 titles por request e
 * encadear isso aqui não vale o churn (Wikimedia é robusto pra requests
 * sequenciais com UA correto).
 */
async function getFileInfo(title: string): Promise<ImageInfoEntry | null> {
  const params = new URLSearchParams({
    action: "query",
    titles: title,
    prop: "imageinfo",
    iiprop: "url|extmetadata|size|mime",
    format: "json",
  });
  const url = `https://commons.wikimedia.org/w/api.php?${params.toString()}`;
  const json = await wmFetch<ImageInfoResp>(url);
  const pages = json.query?.pages;
  if (!pages) return null;
  for (const key of Object.keys(pages)) {
    const info = pages[key].imageinfo?.[0];
    if (info) return info;
  }
  return null;
}

async function main(): Promise<void> {
  console.log(`[ingest-gray-anatomy] listando ${CATEGORY}…`);
  const files = await listCategoryFiles();
  console.log(`[ingest-gray-anatomy] ${files.length} arquivos encontrados`);

  if (files.length === 0) {
    console.log("Nada pra ingerir.");
    return;
  }

  let processed = 0;
  let inserted = 0;
  let skippedExists = 0;
  let skippedSvg = 0;
  let skippedTooBig = 0;
  let skippedOther = 0; // formato não suportado / sem info
  let errored = 0;
  const total = files.length;

  for (const file of files) {
    processed++;
    const tag = `[${processed}/${total}] ${file.title}`;

    let info: ImageInfoEntry | null = null;
    try {
      info = await getFileInfo(file.title);
    } catch (err) {
      console.warn(`${tag} · fileinfo falhou: ${(err as Error).message}`);
      errored++;
      continue;
    }
    if (!info || !info.url) {
      console.warn(`${tag} · sem imageinfo`);
      skippedOther++;
      continue;
    }

    const ext = extFromMime(info.mime);
    if (ext === "svg") {
      console.log(`${tag} · skip SVG`);
      skippedSvg++;
      continue;
    }
    if (ext === "other") {
      console.log(`${tag} · skip mime ${info.mime ?? "?"}`);
      skippedOther++;
      continue;
    }

    if (typeof info.size === "number" && info.size > MAX_BYTES) {
      console.log(`${tag} · skip >${MAX_BYTES} bytes (${info.size})`);
      skippedTooBig++;
      continue;
    }

    const filename = sanitizeFilename(file.title);
    const storagePath = `${BOOK_SLUG}/${filename}.${ext}`;

    if (await storagePathExists(storagePath)) {
      console.log(`${tag} · skip (já existe ${storagePath})`);
      skippedExists++;
      continue;
    }

    // Download — segundo check de tamanho via Content-Length, e se vier maior
    // que o esperado, abortamos o read.
    let imgBuf: Buffer;
    let mimeFromDownload: string;
    try {
      const resp = await fetch(info.url, {
        headers: { "user-agent": USER_AGENT },
      });
      if (!resp.ok) throw new Error(`download ${resp.status}`);
      const ab = await resp.arrayBuffer();
      if (ab.byteLength > MAX_BYTES) {
        console.log(`${tag} · skip download >${MAX_BYTES} (${ab.byteLength})`);
        skippedTooBig++;
        continue;
      }
      imgBuf = Buffer.from(ab);
      mimeFromDownload =
        resp.headers.get("content-type") ?? (ext === "jpg" ? "image/jpeg" : "image/png");
    } catch (err) {
      console.warn(`${tag} · download falhou: ${(err as Error).message}`);
      errored++;
      continue;
    }

    // Caption: ImageDescription HTML → texto. Se vazio, usa ObjectName ou title.
    const rawDesc = info.extmetadata?.ImageDescription?.value ?? "";
    const objName = info.extmetadata?.ObjectName?.value ?? "";
    let caption = stripHtml(rawDesc);
    if (!caption) caption = stripHtml(objName);
    if (!caption) caption = file.title.replace(/^File:/i, "");
    // Limita pra não estourar tokens no embedding (text-embedding-3-small).
    if (caption.length > 2000) caption = `${caption.slice(0, 2000)}…`;

    // Embedding (1 por imagem — não vale batchar aqui porque o gargalo é
    // a chamada por-arquivo na API da Wikimedia).
    let embedding: number[];
    try {
      const r = await generateEmbedding(caption, OPENAI_API_KEY as string);
      embedding = r.embedding;
    } catch (err) {
      console.warn(`${tag} · embed falhou: ${(err as Error).message}`);
      errored++;
      continue;
    }

    // Upload
    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, imgBuf, {
        contentType: mimeFromDownload,
        upsert: false,
      });
    if (upErr) {
      console.warn(`${tag} · upload falhou: ${upErr.message}`);
      errored++;
      continue;
    }

    // Insert — page_number=null porque Commons não tem numeração de página
    // que case com a edição impressa do Gray's.
    const row = {
      book_slug: BOOK_SLUG,
      book_title: BOOK_TITLE,
      page_number: null as number | null,
      storage_path: storagePath,
      caption_text: caption,
      classification: null as string | null,
      width: typeof info.width === "number" ? info.width : 0,
      height: typeof info.height === "number" ? info.height : 0,
      embedding,
    };
    const { error: insErr } = await supabase
      .from("atlas_global_images")
      .insert(row);
    if (insErr) {
      console.warn(`${tag} · insert falhou: ${insErr.message}`);
      // limpa blob órfão pra próxima rodada idempotente
      await supabase.storage.from(BUCKET).remove([storagePath]).catch(() => {});
      errored++;
      continue;
    }

    inserted++;
    console.log(`${tag} · captured (${storagePath})`);
  }

  console.log("");
  console.log("=== resumo ===");
  console.log(`processados:        ${processed}`);
  console.log(`inseridos:          ${inserted}`);
  console.log(`pulados (já existe):${skippedExists}`);
  console.log(`pulados (SVG):      ${skippedSvg}`);
  console.log(`pulados (>5MB):     ${skippedTooBig}`);
  console.log(`pulados (outros):   ${skippedOther}`);
  console.log(`erros:              ${errored}`);
}

main().catch((err) => {
  console.error("[ingest-gray-anatomy] fatal:", err);
  process.exit(1);
});
