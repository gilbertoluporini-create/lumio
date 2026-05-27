#!/usr/bin/env node
/**
 * Gera capas (1 por artigo) via OpenAI gpt-image-1, faz upload pro bucket
 * `article-covers` no Supabase Storage, e persiste o mapping em
 * `help_article_covers`.
 *
 * Rodar uma vez após:
 *   - OPENAI_API_KEY em .env.local
 *   - bucket `article-covers` criado (public read)
 *   - migration 014 aplicada
 *
 * Custo: ~$0.063/img × 18 artigos ≈ $1.13 total.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Carrega .env.local na unha (sem dependência externa)
function loadEnv() {
  const text = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
  for (const line of text.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
loadEnv();

const OPENAI_KEY = process.env.OPENAI_API_KEY;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!OPENAI_KEY || !SUPABASE_URL || !SERVICE_ROLE) {
  console.error("Faltam OPENAI_API_KEY, NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const BUCKET = "article-covers";

// Lista de artigos — copiado e simplificado de help-articles.ts.
// Mantém só {slug, title, excerpt, categorySlug}. Se o conteúdo de help-articles
// mudar, atualize aqui também (não puxo runtime pra evitar import TS).
const ARTICLES = [
  { slug: "criar-conta", title: "Crie sua conta no Lumio", excerpt: "Em menos de um minuto você cria sua conta e começa a gravar e resumir aulas.", categorySlug: "primeiros-passos" },
  { slug: "adicionar-materia", title: "Adicione sua primeira matéria", excerpt: "Organize seu material por matéria pra acessar tudo de um curso só.", categorySlug: "primeiros-passos" },
  { slug: "primeira-aula", title: "Grave sua primeira aula", excerpt: "Passo a passo pra gravar uma aula presencial e gerar resumo automático.", categorySlug: "primeiros-passos" },
  { slug: "transcricao-ao-vivo", title: "Como funciona a transcrição ao vivo", excerpt: "O Lumio escuta a aula e transcreve em tempo real no seu navegador.", categorySlug: "gravacoes" },
  { slug: "anexar-pdf", title: "Anexar PDF de slides à aula", excerpt: "Sincronize seus slides com a transcrição em tempo real.", categorySlug: "gravacoes" },
  { slug: "pausar-retomar", title: "Pausar e retomar gravações", excerpt: "Faça pausas durante a aula sem perder o contexto.", categorySlug: "gravacoes" },
  { slug: "resumo-ia", title: "Como funciona o resumo com IA", excerpt: "O resumo é gerado a partir da transcrição completa da aula.", categorySlug: "resumos" },
  { slug: "editar-resumos", title: "Editar e enriquecer resumos", excerpt: "Adicione anotações, destaque trechos e personalize o conteúdo.", categorySlug: "resumos" },
  { slug: "exportar-resumos", title: "Exportar resumos em PDF e Markdown", excerpt: "Leve seus resumos pra outros estudos ou compartilhe com colegas.", categorySlug: "resumos" },
  { slug: "diferenca-planos", title: "Diferença entre Starter, Pro e Power", excerpt: "Entenda qual plano combina com seu ritmo de estudos.", categorySlug: "planos" },
  { slug: "cancelar-assinatura", title: "Como cancelar a assinatura", excerpt: "Cancele a qualquer momento sem perder o acesso até o fim do ciclo.", categorySlug: "planos" },
  { slug: "mudar-plano", title: "Mudar de plano (upgrade ou downgrade)", excerpt: "Suba ou desça de plano quando o ritmo de estudos mudar.", categorySlug: "planos" },
  { slug: "microfone-nao-funciona", title: "O microfone não está funcionando", excerpt: "Diagnóstico rápido pra liberar o mic do navegador.", categorySlug: "solucao-problemas" },
  { slug: "perdi-a-gravacao", title: "Perdi minha gravação", excerpt: "O que fazer quando uma aula não aparece no dashboard.", categorySlug: "solucao-problemas" },
  { slug: "erro-no-checkout", title: "Erro no checkout / pagamento", excerpt: "Problemas comuns na compra e como resolver em segundos.", categorySlug: "solucao-problemas" },
];

const CATEGORY_ANCHORS = {
  "primeiros-passos": "young Brazilian university student opening a laptop at a clean wooden desk, golden hour daylight from a window, focused expression, books and coffee mug nearby",
  "gravacoes": "modern smartphone on a notebook with handwritten notes, neutral lecture-hall background slightly out of focus, soft daylight",
  "resumos": "neatly arranged printed pages and highlighters on a minimalist desk, top-down editorial flatlay, natural daylight",
  "planos": "abstract clean minimal desk with a smartphone showing a generic dashboard mockup, soft daylight, no readable UI",
  "solucao-problemas": "person fixing a problem at a quiet workspace, looking thoughtful at a laptop, soft natural daylight, calm mood",
};

function buildPrompt({ title, excerpt, categorySlug }) {
  const anchor = CATEGORY_ANCHORS[categorySlug] ?? "young university student studying in a clean modern workspace, natural daylight";
  return [
    `Editorial documentary photograph for an article titled "${title}".`,
    `Brief context: ${excerpt}`,
    "",
    `Subject: ${anchor}`,
    "",
    "Style: shot on a 50mm lens at f/2.8, shallow depth of field, soft natural window light, muted earth-tone palette, photorealistic, single clean focal subject.",
    "Avoid: text overlays, captions, watermarks, logos, multiple subjects, oversaturation, neon colors, 3D render look, AI-style hyperreal skin, fantasy elements, anything visibly synthetic.",
    "Mood: calm, professional, aspirational — feels like a real lifestyle photograph from a magazine like Monocle or The New Yorker.",
  ].join("\n");
}

async function generateOne(article) {
  const { slug, categorySlug } = article;
  const prompt = buildPrompt(article);

  // 1. OpenAI image gen
  const oaResp = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${OPENAI_KEY}` },
    body: JSON.stringify({
      model: "gpt-image-1",
      prompt,
      n: 1,
      size: "1536x1024",
      quality: "medium",
      output_format: "png",
    }),
  });
  const oaJson = await oaResp.json();
  if (!oaResp.ok) {
    throw new Error(`OpenAI ${oaResp.status}: ${oaJson.error?.message ?? "?"}`);
  }
  const b64 = oaJson.data?.[0]?.b64_json;
  if (!b64) throw new Error("OpenAI sem b64_json");
  const buffer = Buffer.from(b64, "base64");

  // 2. Upload pro bucket
  const key = `${categorySlug}/${slug}.png`;
  const upResp = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${key}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${SERVICE_ROLE}`,
      apikey: SERVICE_ROLE,
      "content-type": "image/png",
      "x-upsert": "true",
    },
    body: buffer,
  });
  if (!upResp.ok) {
    const t = await upResp.text();
    throw new Error(`Upload ${upResp.status}: ${t}`);
  }
  const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${key}`;

  // 3. Upsert na tabela help_article_covers (via PostgREST)
  const dbResp = await fetch(`${SUPABASE_URL}/rest/v1/help_article_covers`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${SERVICE_ROLE}`,
      apikey: SERVICE_ROLE,
      "content-type": "application/json",
      prefer: "resolution=merge-duplicates",
    },
    body: JSON.stringify({
      slug,
      category_slug: categorySlug,
      image_url: publicUrl,
      prompt,
      generated_at: new Date().toISOString(),
    }),
  });
  if (!dbResp.ok && dbResp.status !== 201) {
    const t = await dbResp.text();
    throw new Error(`DB upsert ${dbResp.status}: ${t}`);
  }

  return publicUrl;
}

async function main() {
  console.log(`Gerando ${ARTICLES.length} capas em paralelo (max 4 simultâneas)...\n`);
  // Paralelismo capado pra não estourar rate limit da OpenAI (500 RPM no tier 1)
  const CONCURRENCY = 4;
  const queue = [...ARTICLES];
  const results = [];

  async function worker(workerId) {
    while (queue.length > 0) {
      const article = queue.shift();
      if (!article) break;
      const start = Date.now();
      try {
        const url = await generateOne(article);
        const ms = Date.now() - start;
        console.log(`[w${workerId}] ✅ ${article.slug} (${ms}ms) → ${url}`);
        results.push({ slug: article.slug, ok: true, url });
      } catch (err) {
        console.error(`[w${workerId}] ❌ ${article.slug}: ${err.message}`);
        results.push({ slug: article.slug, ok: false, error: err.message });
      }
    }
  }

  await Promise.all(
    Array.from({ length: CONCURRENCY }, (_, i) => worker(i + 1)),
  );

  const ok = results.filter((r) => r.ok).length;
  const fail = results.filter((r) => !r.ok).length;
  console.log(`\n📊 ${ok} sucesso, ${fail} falha. Custo estimado: $${(ok * 0.063).toFixed(2)}`);
  if (fail > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
