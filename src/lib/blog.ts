/**
 * Blog content loader.
 *
 * Posts são arquivos .md em src/content/blog/ com frontmatter YAML simples.
 * Parser custom (sem gray-matter) pra evitar deps extras — o formato é
 * minimal e estável. Renderização usa react-markdown + remark-gfm (já no deps).
 *
 * Tudo síncrono no build (server components) — Next.js cacheia estaticamente.
 */
import { promises as fs } from "node:fs";
import path from "node:path";

export type BlogPostMeta = {
  slug: string;
  title: string;
  description: string;
  publishedAt: string; // ISO date
  readingMinutes: number;
  tags: string[];
};

export type BlogPost = BlogPostMeta & {
  content: string;
};

const BLOG_DIR = path.join(process.cwd(), "src", "content", "blog");

/**
 * Parser de frontmatter ultra-simples.
 * Aceita: chave: valor (string) e chave: [a, b, c] (array inline).
 * Não suporta YAML aninhado — não precisa.
 */
function parseFrontmatter(raw: string): {
  data: Record<string, string | string[]>;
  body: string;
} {
  const match = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  if (!match) return { data: {}, body: raw };

  const [, fmBlock, body] = match;
  const data: Record<string, string | string[]> = {};

  for (const line of fmBlock.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const colonIdx = trimmed.indexOf(":");
    if (colonIdx === -1) continue;
    const key = trimmed.slice(0, colonIdx).trim();
    let value = trimmed.slice(colonIdx + 1).trim();

    // Array inline: [a, b, c]
    if (value.startsWith("[") && value.endsWith("]")) {
      const items = value
        .slice(1, -1)
        .split(",")
        .map((s) => s.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean);
      data[key] = items;
      continue;
    }

    // String com quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    data[key] = value;
  }

  return { data, body: body ?? "" };
}

function asString(v: string | string[] | undefined, fallback = ""): string {
  if (Array.isArray(v)) return v[0] ?? fallback;
  return v ?? fallback;
}

function asArray(v: string | string[] | undefined): string[] {
  if (Array.isArray(v)) return v;
  if (typeof v === "string" && v.length > 0) return [v];
  return [];
}

/**
 * Estima reading time honesto.
 * ~250 palavras/min, mínimo 1 min.
 */
export function estimateReadingMinutes(text: string): number {
  const words = text.trim().split(/\s+/).length;
  return Math.max(1, Math.round(words / 250));
}

async function readPostFile(filename: string): Promise<BlogPost | null> {
  if (!filename.endsWith(".md")) return null;
  const filePath = path.join(BLOG_DIR, filename);
  const raw = await fs.readFile(filePath, "utf-8");
  const { data, body } = parseFrontmatter(raw);

  const slug = asString(data.slug, filename.replace(/\.md$/, ""));
  const title = asString(data.title);
  const description = asString(data.description);
  const publishedAt = asString(data.publishedAt);
  const readingFromFm = asString(data.readingMinutes);
  const readingMinutes = readingFromFm
    ? Number(readingFromFm) || estimateReadingMinutes(body)
    : estimateReadingMinutes(body);
  const tags = asArray(data.tags);

  if (!title || !slug) return null;

  return {
    slug,
    title,
    description,
    publishedAt,
    readingMinutes,
    tags,
    content: body,
  };
}

export async function getAllPosts(): Promise<BlogPostMeta[]> {
  let files: string[];
  try {
    files = await fs.readdir(BLOG_DIR);
  } catch {
    return [];
  }

  const posts = await Promise.all(files.map((f) => readPostFile(f)));
  return posts
    .filter((p): p is BlogPost => p !== null)
    .map(({ content: _content, ...meta }) => meta)
    .sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));
}

export async function getPost(slug: string): Promise<BlogPost | null> {
  const safeSlug = slug.replace(/[^a-z0-9-]/gi, "");
  if (!safeSlug) return null;
  try {
    return await readPostFile(`${safeSlug}.md`);
  } catch {
    return null;
  }
}

export async function getAllSlugs(): Promise<string[]> {
  const posts = await getAllPosts();
  return posts.map((p) => p.slug);
}

export function formatPublishedDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}
