/**
 * Regenera TODAS as capas dos help articles com o prompt Lumi atualizado.
 *
 * Por que existe: o prompt do `/api/admin/articles/generate-cover` foi
 * reescrito (mascote Lumi, sem grain). As capas antigas no bucket
 * `article-covers` continuam com o look antigo. Esse script força regeração.
 *
 * Uso:
 *   pnpm tsx scripts/regenerate-article-covers.ts
 *   ou
 *   npx tsx scripts/regenerate-article-covers.ts
 *
 * Pré-requisitos:
 *   - .env.local com NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 *   - Server rodando (default http://localhost:3000) OU passar BASE_URL=...
 *   - Cookie de admin (paste no ADMIN_COOKIE)
 *
 * É reversível? Sim — cada chamada faz upsert na tabela, então rodar de
 * novo só sobrescreve. Não deleta nada.
 *
 * Tempo estimado: ~10s por capa (gpt-image-1 medium). ~20 artigos = ~3min.
 */

// Carrega .env.local manualmente (sem dotenv pra não adicionar dep só pro script)
import { readFileSync } from "fs";
import { resolve } from "path";

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
  // .env.local não existe — segue só com env do shell
}

const BASE_URL = process.env.BASE_URL ?? "https://www.lumioapp.net";
const ADMIN_COOKIE = process.env.ADMIN_COOKIE ?? "";

if (!ADMIN_COOKIE) {
  console.error(
    "ADMIN_COOKIE não setado. Pegue do navegador (logado como admin) — DevTools → Application → Cookies → copie tudo como 'name=value; name2=value2; ...'",
  );
  process.exit(1);
}

async function main() {
  // Import dinâmico pra não quebrar build do Next se rodar com tsx
  const { helpCategories } = await import("../src/lib/help-articles");

  const targets: Array<{
    slug: string;
    categorySlug: string;
    title: string;
    excerpt: string;
  }> = [];
  for (const cat of helpCategories) {
    for (const art of cat.articles) {
      targets.push({
        slug: art.slug,
        categorySlug: cat.slug,
        title: art.title,
        excerpt: art.excerpt ?? art.title,
      });
    }
  }
  console.log(`> ${targets.length} artigos pra regerar`);

  let ok = 0;
  let fail = 0;
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    process.stdout.write(
      `[${i + 1}/${targets.length}] ${t.categorySlug}/${t.slug}... `,
    );
    try {
      const resp = await fetch(`${BASE_URL}/api/admin/articles/generate-cover`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: ADMIN_COOKIE,
        },
        body: JSON.stringify(t),
      });
      if (!resp.ok) {
        const err = await resp.text();
        console.log(`FALHA (${resp.status}): ${err.slice(0, 120)}`);
        fail++;
      } else {
        const json = await resp.json();
        console.log(`ok ${json.url?.slice(-40) ?? ""}`);
        ok++;
      }
    } catch (err) {
      console.log(`CRASH: ${(err as Error).message}`);
      fail++;
    }
    // Pequena pausa pra não estressar a API de imagens
    await new Promise((r) => setTimeout(r, 800));
  }

  console.log(`\nDone. ok=${ok} fail=${fail}`);
}

main().catch((err) => {
  console.error("fatal:", err);
  process.exit(1);
});
