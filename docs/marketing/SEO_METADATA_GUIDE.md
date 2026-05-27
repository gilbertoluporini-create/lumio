# SEO + Metadata Guide · Lumio

> Versão 1 · 2026-05-26
> Audiência: devs do Lumio (e Replit clone) adicionando páginas novas.

## TL;DR

Toda página pública do Lumio precisa:

1. Metadata server-side (export `metadata` ou `generateMetadata`)
2. Canonical absoluta (`https://lumioapp.net/...`)
3. OG image dinâmica via `/api/og?title=...&subtitle=...&type=...`
4. Title format: `X · Lumio` (max 60 chars)
5. Description 140-160 chars com keyword + benefício
6. Twitter card `summary_large_image`

Use **sempre** o helper `buildPageMetadata` em `src/lib/seo.ts` — ele garante consistência.

---

## 1. Helper único: `buildPageMetadata`

Arquivo: `src/lib/seo.ts`

```ts
import { buildPageMetadata } from "@/lib/seo";

export const metadata = buildPageMetadata({
  title: "Como transcrever aula · Lumio",
  description: "Guia prático em pt-BR pra transcrever aula com IA. ...",
  path: "/blog/como-transcrever-aula",
  ogImageType: "blog", // default | blog | landing | persona
});
```

Aceita também:

- `ogTitle`, `ogDescription` — override pro card social (default usa `title`/`description`)
- `ogType: "article"` + `publishedTime` + `tags` — pra blog posts
- `ogImageUrl` — override completo (use só se for PNG estático)
- `ogImageType` + `ogImagePersona` — controla layout do OG dinâmico
- `noindex: true` — pra páginas auth/transitional

## 2. Páginas client (`"use client"`)

Next.js não aceita `export const metadata` em arquivo com `"use client"`.

**Solução**: criar `layout.tsx` adjacente ao `page.tsx`:

```tsx
// src/app/minha-rota/layout.tsx
import { buildPageMetadata } from "@/lib/seo";

export const metadata = buildPageMetadata({ ... });

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
```

Exemplos no projeto: `pricing/layout.tsx`, `(auth)/login/layout.tsx`, `(auth)/signup/layout.tsx`, `guia-revisao/layout.tsx`, `lumi/layout.tsx`, `dashboard/layout.tsx`, `onboarding/layout.tsx`.

---

## 3. OG image dinâmica: `/api/og`

Endpoint: `src/app/api/og/route.tsx` (Next.js `ImageResponse`, runtime nodejs).

### Query params

| Param      | Tipo     | Obrigatório | Default                                  |
| ---------- | -------- | ----------- | ---------------------------------------- |
| `title`    | string   | recomendado | "Estude menos. Entenda mais."            |
| `subtitle` | string   | opcional    | "Transcrição de aula + IA com contexto." |
| `type`     | enum     | opcional    | "default"                                |
| `persona`  | string   | opcional    | —                                        |

Valores válidos pra `type`: `default`, `blog`, `landing`, `persona`.

Valores típicos pra `persona`: `medicina`, `direito`, `administracao`, `engenharia`, `psicologia`.

### Exemplos

```
# OG do blog post
/api/og?title=Como+transcrever+aula&subtitle=Em+pt-BR+com+IA&type=blog

# OG da landing
/api/og?title=Volte+a+olhar+pro+professor&subtitle=Transcri%C3%A7%C3%A3o+ao+vivo&type=landing

# OG da persona Medicina
/api/og?title=Medicina+no+Lumio&subtitle=Resumo+e+flashcards+com+IA&type=persona&persona=medicina
```

### Como o helper monta a URL

`buildPageMetadata` chama `ogImage({ title, subtitle, type, persona })` que retorna URL absoluta — Slack/X/WhatsApp **exigem URL absoluta** pra mostrar preview.

### Performance

- Cache: `Cache-Control: public, immutable, max-age=31536000, s-maxage=31536000`
- Fingerprint é a própria querystring → cache infinito por combinação
- Fontes Outfit (peso 800 + 500) carregadas via fetch Google Fonts TTF
- Mascote embedded via `<img src="https://lumioapp.net/illustrations/lumi-default.png">`

### Falhas conhecidas

- Se a fonte Outfit não carregar (timeout Google), cai pro sans default — não quebra
- Se a imagem do mascote não estiver disponível em produção, ImageResponse ignora silenciosamente
- ImageResponse tem bundle max 500KB — não embed asset pesado

---

## 4. Validar OG em produção

```bash
# Headers OG presentes
curl -sIL https://lumioapp.net/blog/como-transcrever-aula-da-faculdade \
  | grep -iE "content-type|cache"

# Ver tags OG no HTML
curl -sL https://lumioapp.net/blog/como-transcrever-aula-da-faculdade \
  | grep -iE 'property="og:|name="twitter:'

# Testar OG image direto
curl -sIL "https://lumioapp.net/api/og?title=Teste&subtitle=De+OG&type=blog" \
  | grep -iE "content-type|cache"

# Forçar refresh nos crawlers:
# - Facebook/WhatsApp: https://developers.facebook.com/tools/debug/?q=URL
# - X/Twitter: https://cards-dev.twitter.com/validator
# - LinkedIn: https://www.linkedin.com/post-inspector/inspect/URL
# - Google: Search Console → URL Inspection → Live Test
```

---

## 5. JSON-LD (Schema.org)

Já implementado:

- **Root `layout.tsx`**: `Organization` + `WebSite` + `SoftwareApplication` (graph)
- **`/pricing/layout.tsx`**: `Product` com `AggregateOffer`
- **`/para-*/page.tsx`**: `Product` via `personaJsonLd(...)` em `components/landing/persona-landing.tsx`
- **`/blog/[slug]/page.tsx`**: `Article` com `author: "Equipe Lumio"` (anonimato founder)

Pra páginas novas: anexar `<script type="application/ld+json">` inline no return do component.

### Anonimato founder

**Nunca** referenciar pessoa nomeada nos `author`/`creator` schema. Sempre `"Equipe Lumio"` ou `"Lumio"` (Organization).

---

## 6. Checklist nova página

Antes de mergear nova rota pública:

- [ ] `metadata` ou `generateMetadata` exportado (use `buildPageMetadata`)
- [ ] `path` absoluto correto (sem trailing slash, sem query)
- [ ] Title ≤ 60 chars
- [ ] Description 140-160 chars
- [ ] Adicionado em `src/app/sitemap.ts` se for indexável
- [ ] Adicionado em `src/app/robots.ts` disallow se for auth/transitional
- [ ] Testado em https://www.opengraph.xyz/ ou Meta Debugger
- [ ] JSON-LD inline se for Product/Article/HowTo
- [ ] H1 único e match com title

---

## 7. Auditoria atual (2026-05-26)

| Rota                  | Metadata | OG dinâmica | JSON-LD             | Canonical | Robots         |
| --------------------- | -------- | ----------- | ------------------- | --------- | -------------- |
| `/`                   | OK       | OK          | Org+WebSite+SwApp   | OK        | index          |
| `/pricing`            | OK       | OK          | Product             | OK        | index          |
| `/blog`               | OK       | OK (blog)   | —                   | OK        | index          |
| `/blog/[slug]`        | OK       | OK (blog)   | Article             | OK        | index          |
| `/para-medicina`      | OK       | OK (persona)| Product             | OK        | index          |
| `/para-direito`       | OK       | OK (persona)| Product             | OK        | index          |
| `/para-administracao` | OK       | OK (persona)| Product             | OK        | index          |
| `/para-engenharia`    | OK       | OK (persona)| Product             | OK        | index          |
| `/para-psicologia`    | OK       | OK (persona)| Product             | OK        | index          |
| `/guia-revisao`       | OK       | OK (landing)| —                   | OK        | index          |
| `/terms`              | OK       | OK          | —                   | OK        | index          |
| `/privacy`            | OK       | OK          | —                   | OK        | index          |
| `/signup`             | OK       | OK          | —                   | OK        | noindex        |
| `/login`              | OK       | OK          | —                   | OK        | noindex        |
| `/lumi`               | OK       | OK          | —                   | OK        | noindex (auth) |
| `/dashboard`          | OK       | OK          | —                   | OK        | noindex (auth) |
| `/onboarding`         | OK       | OK          | —                   | OK        | noindex (auth) |

---

## 8. Próximos passos

- Subir `og-default.png` (1200x630) em `/public/` como fallback estático — pedir Replit (briefing no `PLANO_VISUAL_COMPLETO.md`)
- Considerar variantes por persona no `/api/og` (hoje todas usam `lumi-default.png`)
- Adicionar BreadcrumbList JSON-LD nas personas e blog posts
- Considerar `opengraph-image.tsx` (file convention) pra rota `/` como fallback do crawler que ignora meta tag
