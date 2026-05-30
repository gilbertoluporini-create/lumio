/**
 * GET /api/admin/marketing/coverage
 *
 * Lê content/marketing/posts/ direto do filesystem e retorna pra cada post
 * quais formatos de imagem estão presentes (1x1, landscape, portrait, story)
 * + slides extras. Verdade em tempo real, não depende do último sync.
 *
 * Admin-only.
 */

import { NextResponse } from "next/server";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { requireAdmin } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const POSTS_DIR = path.join(process.cwd(), "content", "marketing", "posts");

export type CoveragePost = {
  slug: string;
  title: string;
  category: string | null;
  networks: string[];
  scheduled_for: string | null;
  has_1x1: boolean;
  has_landscape: boolean;
  has_portrait: boolean;
  has_story: boolean;
  slides_extra: number;
};

export type CoverageResponse = {
  total: number;
  totals: {
    has_landscape: number;
    has_portrait: number;
    has_story: number;
  };
  posts: CoveragePost[];
};

async function fileExists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function countExtraSlides(folder: string): Promise<number> {
  let n = 0;
  for (let i = 2; i <= 10; i++) {
    if (await fileExists(path.join(folder, `slide-${i}.jpg`))) n++;
    else break;
  }
  return n;
}

async function inspectPost(slug: string): Promise<CoveragePost> {
  const folder = path.join(POSTS_DIR, slug);

  let meta: Record<string, unknown> | null = null;
  try {
    const raw = await readFile(path.join(folder, "metadata.json"), "utf-8");
    meta = JSON.parse(raw);
  } catch {
    /* sem metadata, segue */
  }

  const [has_1x1, has_landscape, has_portrait, has_story, slides_extra] =
    await Promise.all([
      fileExists(path.join(folder, "1x1.jpg")),
      fileExists(path.join(folder, "landscape.jpg")),
      fileExists(path.join(folder, "portrait.jpg")),
      fileExists(path.join(folder, "story.jpg")),
      countExtraSlides(folder),
    ]);

  return {
    slug,
    title: typeof meta?.title === "string" ? meta.title : slug,
    category: typeof meta?.category === "string" ? meta.category : null,
    networks: Array.isArray(meta?.networks)
      ? (meta.networks as unknown[]).filter((n): n is string => typeof n === "string")
      : [],
    scheduled_for:
      typeof meta?.scheduled_for === "string" ? meta.scheduled_for : null,
    has_1x1,
    has_landscape,
    has_portrait,
    has_story,
    slides_extra,
  };
}

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  let entries: string[];
  try {
    const dirents = await readdir(POSTS_DIR, { withFileTypes: true });
    entries = dirents
      .filter((d) => d.isDirectory() && !d.name.startsWith("."))
      .map((d) => d.name)
      .sort();
  } catch (err) {
    const msg = err instanceof Error ? err.message : "erro desconhecido";
    return NextResponse.json(
      { error: `pasta ${POSTS_DIR} não acessível: ${msg}` },
      { status: 500 },
    );
  }

  const posts = await Promise.all(entries.map(inspectPost));

  const totals = {
    has_landscape: posts.filter((p) => p.has_landscape).length,
    has_portrait: posts.filter((p) => p.has_portrait).length,
    has_story: posts.filter((p) => p.has_story).length,
  };

  const body: CoverageResponse = { total: posts.length, totals, posts };
  return NextResponse.json(body);
}
