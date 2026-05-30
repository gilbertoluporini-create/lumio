/**
 * POST /api/admin/marketing/content/sync
 *
 * Lê `content/marketing/posts/<slug>/` do filesystem e upserta `content_drafts`
 * via slug. Imagens são uploadadas pro Supabase Storage (bucket marketing-images,
 * prefixo `synced/<slug>/`).
 *
 * Source of truth: filesystem. Sync é idempotente:
 *  - pasta nova → novo draft
 *  - metadata.json mudou → update do draft existente (mesmo slug)
 *  - pasta removida → status='rejected' (NÃO deleta o registro pra preservar histórico)
 *
 * Schema esperado de metadata.json:
 *   {
 *     "id": "001-slug-aqui",
 *     "scheduled_for": "2026-06-01T12:00:00-03:00",
 *     "networks": ["instagram", "facebook", "x", "linkedin"],
 *     "category": "curiosidade",
 *     "title": "Título interno",
 *     "content": {
 *       "instagram": { caption, hashtags },
 *       "facebook":  { caption },
 *       "x":         { thread: [...] },
 *       "linkedin":  { headline, body }
 *     }
 *   }
 *
 * Resp:
 *   { synced: [slug, ...], errors: [{slug, msg}], orphaned: [slug, ...] }
 *
 * Apenas admin.
 */

import { NextResponse } from "next/server";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { requireAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const BUCKET = "marketing-images";
const POSTS_DIR = path.join(process.cwd(), "content", "marketing", "posts");

type RatioFile = { ratio: "1x1" | "landscape" | "portrait" | "story"; filename: string };
const RATIO_FILES: RatioFile[] = [
  { ratio: "1x1", filename: "1x1.jpg" },
  { ratio: "landscape", filename: "landscape.jpg" },
  { ratio: "portrait", filename: "portrait.jpg" },
  { ratio: "story", filename: "story.jpg" },
];

type PostMetadata = {
  id: string;
  scheduled_for: string;
  networks: string[];
  category?: string;
  title?: string;
  content: Record<string, Record<string, unknown>>;
};

async function ensureBucket(supabase: ReturnType<typeof createAdminClient>) {
  try {
    const { data } = await supabase.storage.getBucket(BUCKET);
    if (data) return;
    await supabase.storage.createBucket(BUCKET, {
      public: true,
      allowedMimeTypes: ["image/png", "image/jpeg", "image/webp"],
      fileSizeLimit: 10 * 1024 * 1024,
    });
  } catch {
    // ignore
  }
}

function validateMetadata(meta: unknown, slug: string): PostMetadata {
  if (!meta || typeof meta !== "object") {
    throw new Error(`metadata.json não é objeto`);
  }
  const m = meta as Record<string, unknown>;
  if (typeof m.id !== "string" || m.id !== slug) {
    throw new Error(`id ("${m.id}") deve ser igual ao nome da pasta ("${slug}")`);
  }
  if (typeof m.scheduled_for !== "string") {
    throw new Error("scheduled_for ausente ou não-string");
  }
  const date = new Date(m.scheduled_for);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`scheduled_for inválido: "${m.scheduled_for}"`);
  }
  if (!Array.isArray(m.networks) || m.networks.length === 0) {
    throw new Error("networks deve ser array não-vazio");
  }
  const ALLOWED_NETWORKS = ["instagram", "facebook", "x", "linkedin"];
  for (const n of m.networks) {
    if (typeof n !== "string" || !ALLOWED_NETWORKS.includes(n)) {
      throw new Error(`network inválida: "${n}". use: ${ALLOWED_NETWORKS.join(", ")}`);
    }
  }
  if (!m.content || typeof m.content !== "object") {
    throw new Error("content ausente ou não-objeto");
  }
  // valida que cada network listada tem content correspondente
  for (const n of m.networks as string[]) {
    if (!(n in (m.content as Record<string, unknown>))) {
      throw new Error(`content.${n} faltando (network listada mas sem conteúdo)`);
    }
  }
  return {
    id: m.id,
    scheduled_for: m.scheduled_for,
    networks: m.networks as string[],
    category: typeof m.category === "string" ? m.category : "curiosidade",
    title: typeof m.title === "string" ? m.title : m.id,
    content: m.content as Record<string, Record<string, unknown>>,
  };
}

async function uploadImage(
  supabase: ReturnType<typeof createAdminClient>,
  slug: string,
  ratio: string,
  filePath: string,
): Promise<string> {
  const buffer = await readFile(filePath);
  const key = `synced/${slug}/${ratio}.jpg`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(key, buffer, {
      contentType: "image/jpeg",
      upsert: true,
    });
  if (error) throw new Error(`upload ${ratio} falhou: ${error.message}`);
  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(key);
  return pub.publicUrl;
}

async function syncOnePost(
  supabase: ReturnType<typeof createAdminClient>,
  slug: string,
): Promise<void> {
  const folder = path.join(POSTS_DIR, slug);
  const metadataPath = path.join(folder, "metadata.json");

  const rawMeta = await readFile(metadataPath, "utf-8");
  const parsed = JSON.parse(rawMeta);
  const meta = validateMetadata(parsed, slug);

  // busca draft existente ANTES — pra reusar imagens não-alteradas (evita
  // re-upload das 21 imagens a cada tick do cron de sync)
  const { data: existing } = await supabase
    .from("content_drafts")
    .select("id, status, images")
    .eq("slug", slug)
    .maybeSingle();

  const existingImages =
    (existing?.images as Record<
      string,
      { url: string; uploaded_at: string } | undefined
    > | null) || {};

  // upload das imagens que existirem (pula se não mudou desde o último upload)
  const images: Record<string, { url: string; uploaded_at: string }> = {};
  for (const { ratio, filename } of RATIO_FILES) {
    const imgPath = path.join(folder, filename);
    let fileStat;
    try {
      fileStat = await stat(imgPath);
    } catch {
      continue; // arquivo não existe, pula
    }
    const prev = existingImages[`ratio_${ratio}`];
    if (
      prev?.url &&
      prev.uploaded_at &&
      fileStat.mtime <= new Date(prev.uploaded_at)
    ) {
      // arquivo não mudou desde o último sync → reusa URL existente
      images[`ratio_${ratio}`] = prev;
      continue;
    }
    const url = await uploadImage(supabase, slug, ratio, imgPath);
    images[`ratio_${ratio}`] = {
      url,
      uploaded_at: new Date().toISOString(),
    };
  }

  // slides extras do carrossel (slide-2.jpg, slide-3.jpg, ...) — opcionais e
  // contíguos a partir de 2. A capa é o 1x1.jpg (slide 1). Se houver slides,
  // o publish monta carrossel [1x1, slide_2, slide_3, ...].
  for (let n = 2; n <= 10; n++) {
    const imgPath = path.join(folder, `slide-${n}.jpg`);
    let fileStat;
    try {
      fileStat = await stat(imgPath);
    } catch {
      break; // sem esse slide → para (slides são contíguos)
    }
    const keyName = `slide_${n}`;
    const prev = existingImages[keyName];
    if (
      prev?.url &&
      prev.uploaded_at &&
      fileStat.mtime <= new Date(prev.uploaded_at)
    ) {
      images[keyName] = prev;
      continue;
    }
    const url = await uploadImage(supabase, slug, `slide-${n}`, imgPath);
    images[keyName] = { url, uploaded_at: new Date().toISOString() };
  }

  if (!images.ratio_1x1) {
    throw new Error("1x1.jpg obrigatório (todas as redes usam)");
  }

  const networksJson = meta.networks.reduce<Record<string, unknown>>(
    (acc, net) => ({ ...acc, [net]: true }),
    {},
  );

  const payload = {
    slug,
    source: "filesystem",
    idea_title: meta.title,
    idea_summary: null,
    category: meta.category,
    content_per_network: meta.content,
    images,
    scheduled_for: meta.scheduled_for,
    // só promove pra 'scheduled' se ainda não foi publicado
    status: existing?.status === "published" ? "published" : "scheduled",
    sync_error: null,
    // armazena lista de networks dentro do JSONB também (cron usa)
    publish_results: { networks_target: networksJson },
  };

  if (existing) {
    await supabase
      .from("content_drafts")
      .update(payload)
      .eq("id", existing.id);
  } else {
    await supabase.from("content_drafts").insert(payload);
  }
}

export async function POST(req: Request) {
  // Aceita 2 formas de auth: sessão admin (botão no painel) OU Bearer
  // CRON_SECRET (automação via GitHub Actions). Assim o sync roda sozinho
  // sem depender de clique manual.
  const authHeader = req.headers.get("authorization") ?? "";
  const cronSecret = process.env.CRON_SECRET;
  const isCron = !!cronSecret && authHeader === `Bearer ${cronSecret}`;

  if (!isCron) {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;
  }

  let entries: string[] = [];
  try {
    const dirents = await readdir(POSTS_DIR, { withFileTypes: true });
    entries = dirents
      .filter((d) => d.isDirectory() && !d.name.startsWith("."))
      .map((d) => d.name);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "erro desconhecido";
    return NextResponse.json(
      { error: `pasta ${POSTS_DIR} não acessível: ${msg}` },
      { status: 500 },
    );
  }

  const supabase = createAdminClient();
  await ensureBucket(supabase);

  const synced: string[] = [];
  const errors: { slug: string; msg: string }[] = [];

  for (const slug of entries) {
    try {
      await syncOnePost(supabase, slug);
      synced.push(slug);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "erro desconhecido";
      errors.push({ slug, msg });
      // tenta gravar erro no draft se já existir
      await supabase
        .from("content_drafts")
        .update({ sync_error: msg.slice(0, 500) })
        .eq("slug", slug);
    }
  }

  // detecta drafts filesystem-source que sumiram do disco — marca como rejected
  const { data: dbSlugs } = await supabase
    .from("content_drafts")
    .select("slug, status")
    .eq("source", "filesystem")
    .not("slug", "is", null);

  const orphaned: string[] = [];
  for (const row of (dbSlugs || []) as Array<{ slug: string; status: string }>) {
    if (!entries.includes(row.slug) && row.status !== "published" && row.status !== "rejected") {
      orphaned.push(row.slug);
      await supabase
        .from("content_drafts")
        .update({ status: "rejected", sync_error: "pasta removida do filesystem" })
        .eq("slug", row.slug);
    }
  }

  return NextResponse.json({
    ok: errors.length === 0,
    synced,
    errors,
    orphaned,
    total: entries.length,
  });
}
