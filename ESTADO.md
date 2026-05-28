# Lumio — ESTADO

## 🟢🟢 2026-05-28 — PIPELINE DE PUBLICAÇÃO LIVE (go-live aprovado)

**O sistema de publicação automática está LIGADO em produção.**

### Como funciona (100% automático)
1. Posts vivem em `content/marketing/posts/<slug>/` (metadata.json + 1x1.jpg)
2. GitHub Actions `.github/workflows/publish-scheduled.yml` roda a cada 5min:
   - **sync**: lê filesystem → sobe imagens pro Supabase Storage → upserta content_drafts (via Bearer CRON_SECRET)
   - **publish**: publica os posts com scheduled_for <= now() no IG + FB Page
3. Posts SEM imagem (1x1.jpg) são recusados pelo sync → não entram no banco → não publicam (sem buraco fantasma)

### Correções críticas dessa sessão (estavam travando tudo)
- **Domínio**: workflow usava `lumioapp.net` que redireciona 307 → `www.lumioapp.net`, e curl dropa Authorization no redirect (401). Fix: usar www direto.
- **Sync automático**: endpoint `/api/admin/marketing/content/sync` agora aceita Bearer CRON_SECRET (além de sessão admin). Antes dependia de clique manual no painel.
- **Otimização**: sync pula re-upload de imagem se mtime <= uploaded_at (não re-sobe 21 imagens por tick).
- `CRON_SECRET` está nos GitHub repo secrets (via `gh secret set`).

### Cronograma LIVE (6 posts prontos, 29/05→03/06)
| Data | Post | Status |
|------|------|--------|
| 29/05 19h | 016 "Estude do seu jeito" | 🟢 publica automático (PRIMEIRO) |
| 30/05 12h | 006 "3 técnicas" | 🟢 |
| 31/05 19h | 017 "Semana organizada" | 🟢 |
| 01/06 12h | 018 "Pergunte na hora" | 🟢 |
| 02/06 19h | 022 "50 coins" | 🟢 |
| 03/06 12h | 002 "GPT-4" | ⚠️ imagem SEM TEXTO — regenerar antes |
| 04/06→18/06 | 15 posts restantes | ⬜ entram conforme gerar imagem |

### Pendências user-side
- **Regenerar 002 com texto** antes de 03/06 (briefing em content/marketing/BRIEFING_VISUAL.md)
- **Gerar imagens dos 15 restantes** (prompts prontos em BRIEFING_VISUAL.md). Salvar como 1x1.jpg na pasta do post, commitar/push → entra automático no próximo sync
- Decisões pendentes (anotadas): TikTok (resolver integração técnica primeiro), impulsionar (mix produto + melhor curiosidade)

### Docs de marketing
- `content/marketing/README.md` — schema metadata.json
- `content/marketing/BRIEFING_VISUAL.md` — textos prontos de cada imagem (modelo com texto embutido)
- `content/marketing/IMAGE_PROMPTS.md` — cenas criativas
- `content/marketing/OVERLAY_TEXTOS.md` — títulos estilo número de impacto



## 🟢 SESSÃO 2026-05-27 noite — X PUBLISH + GITHUB ACTIONS CRON

### Mudanças críticas

**1. X (Twitter) publish ATIVO** (esperando env vars do user)
- `marketing-publish.ts` agora chama `publish-x.ts` direto. Suporta thread (preferido) ou tweet único + imagem (landscape > 1x1).
- Hashtags vão no último tweet da thread (não nos primeiros, pra evitar truncate).
- Username default `lumioapp_br` (override via `X_USERNAME`).
- **User precisa**: criar app developer.x.com + setar 4 env vars no Vercel: `X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN`, `X_ACCESS_TOKEN_SECRET`.

**2. Cron migrado pro GitHub Actions** (Lumio é Vercel Hobby)
- Hobby = max 2 crons + schedules daily-only. Lumio já tinha 2 (health-check + email-onboarding).
- Solução: `.github/workflows/publish-scheduled.yml` dispara `*/5 * * * *` chamando `https://lumioapp.net/api/cron/publish-scheduled` com Bearer CRON_SECRET.
- `vercel.json` voltou a ter só 2 crons (removido publish-scheduled).
- Secret `CRON_SECRET` adicionado no GitHub repo via `gh secret set` (mesmo valor do Vercel env).
- Custo: ~1440 min/mês de Actions (dentro dos 2000 grátis).

### Schema metadata.json — content.x atualizado

Suporta 2 formatos:
```jsonc
// Thread (preferido):
"x": {
  "thread": ["tweet1", "tweet2", "tweet3"],
  "hashtags": ["ia", "tech"]
}

// Tweet único:
"x": {
  "tweet": "Texto único até 280 chars",
  "hashtags": ["..."]
}
```

Imagem usada: `landscape.jpg` (preferido) ou `1x1.jpg` (fallback). Hashtags concatenadas no último tweet.

---

## 🟢 SESSÃO 2026-05-27 tarde — CALENDÁRIO + CRON DE PUBLICAÇÃO

### Pivô estratégico: removida geração via IA
Founder decidiu: **conteúdo é pré-feito offline**, painel só agenda e publica. Sem mais "Estúdio" / geração de ideias / prompts de imagem.

### Nova arquitetura — source of truth é o filesystem

```
content/marketing/posts/<slug>/
  metadata.json    ← scheduled_for, networks, content per network
  1x1.jpg          ← obrigatório
  landscape.jpg    ← opcional
  portrait.jpg     ← opcional
```

Doc completo em `content/marketing/README.md`.

### Fluxo end-to-end

1. Founder cria pasta `content/marketing/posts/<NNN-slug>/` + edita metadata.json + dropa imagens
2. Commit/push pro git (Vercel deploy automático)
3. Painel `/admin/marketing/crescimento` aba **Calendário** → botão **Sincronizar pasta**
4. Endpoint `POST /api/admin/marketing/content/sync`:
   - Lê filesystem (`process.cwd()/content/marketing/posts/`)
   - Sobe imagens pro Supabase Storage `marketing-images/synced/<slug>/`
   - Upserta `content_drafts` via `slug` (chave única)
   - Marca `status='scheduled'` + `source='filesystem'`
   - Posts removidos do filesystem viram `status='rejected'`
5. Cron `*/5 * * * *` em `/api/cron/publish-scheduled`:
   - Lê drafts com `status='scheduled' AND scheduled_for <= now()`
   - Publica em todas as redes alvo (IG+FB ativas; X+LinkedIn stub)
   - Marca `status='published'` + grava `publish_results`

### Arquivos novos
```
src/lib/marketing-publish.ts                          ← lógica publish compartilhada (publish endpoint + cron)
src/app/api/admin/marketing/content/sync/route.ts     ← lê filesystem, sobe Storage, upserta drafts
src/app/api/cron/publish-scheduled/route.ts           ← cron Vercel, BATCH_SIZE=5/tick
supabase/migrations/021_content_drafts_filesystem_source.sql
content/marketing/README.md                           ← doc schema metadata.json
content/marketing/posts/001-exemplo-curiosidade-gpt/  ← post exemplo (metadata.json + 1x1.jpg)
```

### Arquivos modificados
- `src/app/admin/marketing/crescimento/client.tsx` — substituído EstudioPanel inteiro (1100 linhas) por `CalendarioPanel` enxuto (~350 linhas). Tab "estudio" → "calendario"
- `src/app/api/admin/marketing/content/drafts/route.ts` — adicionado filtro `?source=filesystem`
- `src/app/api/admin/marketing/content/publish/route.ts` — refatorado pra usar `marketing-publish.ts` (compartilhado com cron)
- `vercel.json` — adicionado cron `*/5 * * * *` em publish-scheduled

### Arquivos removidos
- `src/app/api/admin/marketing/content/suggest-ideas/`
- `src/app/api/admin/marketing/content/generate-text/`
- `src/app/api/admin/marketing/content/generate-image-prompt/`
- `src/app/api/admin/marketing/content/generate-images/`
- `src/app/api/admin/marketing/content/upload-image/`

### Schema migration 021
```sql
alter table content_drafts add column slug text;          -- chave de upsert da sync
alter table content_drafts add column source text default 'manual';  -- 'manual' | 'filesystem'
alter table content_drafts add column sync_error text;    -- última falha de publish
create unique index content_drafts_slug_idx on content_drafts(slug) where slug is not null;
alter table content_drafts alter column idea_title drop not null;
```

Aplicado em remote via `supabase db push` após `migration repair` em 011-020.

### Estado das redes
| Rede | Status | Bloqueador |
|------|--------|------------|
| Instagram | ✅ Funcional (Graph API v21) | — |
| Facebook Page | ✅ Funcional (Graph API v21) | — |
| X (Twitter) | ⚠️ `src/lib/publish-x.ts` pronto + stub em marketing-publish.ts retorna erro claro | Falta criar app em developer.x.com e setar `X_API_KEY/X_API_SECRET/X_ACCESS_TOKEN/X_ACCESS_TOKEN_SECRET` |
| LinkedIn | ❌ Stub retorna erro claro | Falta criar Company Page + app + aprovar Community Management API. Alternativa: Buffer/Publer ($6-10/mês) |

### Próximas ações user-side
1. **Criar app X** em developer.x.com (free tier 500 posts/mês basta) — tutorial completo na sessão anterior
2. **Criar Company Page Lumio + app LinkedIn** + pedir Community Management API (espera 2-4 semanas)
3. **Popular pasta** `content/marketing/posts/` com posts reais (deletar `001-exemplo-curiosidade-gpt` quando tiver outros)
4. **Verificar Vercel plan**: cron a cada 5min requer **Pro** (Hobby = max diário). Conferir em vercel.com/<team>/settings/billing

### ⚠️ Atenção custos Vercel
- Hobby plan: limitado a crons diários, 2 totais
- Pro plan ($20/mês): ilimitado, qualquer schedule
- Lumio já tinha 2 crons (health-check + email-onboarding), adicionei o 3º. Se em Hobby → vai falhar deploy ou pular crons

---

## 🟢 SESSÃO 2026-05-27 madrugada (anterior) — ESTÚDIO MULTI-REDE LIVE

**O que tá rodando em prod agora (commit `011d6d4`):**

### 1. Painel `/admin/marketing/crescimento` — 5 abas
- **Estúdio** ← MAIOR ENTREGA. Fábrica de conteúdo educacional/curiosidade/tech/IA multi-rede.
- **Warmup IG** — 9 posts originais com publish 1-clique via Graph API
- **Outbound** — DMs draftadas por IA, founder copia/cola no IG manual (Graph API exige App Review pra DM proativa)
- **Inbox** — mensagens IG via webhook (24h response window) — webhook ainda não configurado
- **Embaixadores** — programa Pro 90d em troca de divulgação, gestão manual

### 2. Fluxo do Estúdio (3 passos)
```
NOVA IDEIA → IA sugere 5 (Mix/Você sabia/Pesquisa/Método/Opinião/Dados)
            → cria draft
            → PASSO 1: gera caption IG + thread X + LinkedIn long + script TikTok (Sonnet 4.6)
            → PASSO 2: gera 3 PROMPTS DE IMAGEM (manual via ChatGPT/Gemini, founder upload)
            → PASSO 3: publica IG + FB Page simultâneo (Graph API)
```

### 3. Decisão estratégica: imagens MANUAIS (não API)
**Mudança crítica do dia**: substituí geração via gpt-image-1 (custo $48/mês + fidelidade Lumi ~40%) por **fluxo manual**:
- Endpoint `generate-image-prompt` retorna 3 prompts textuais prontos (1:1, 16:9, 9:16) com brand master embeddado
- Founder copia → cola no ChatGPT Plus / Gemini / Claude Max (que ele já paga) → gera → faz upload
- Endpoint `upload-image` multipart → Supabase Storage `marketing-images` → salva URL no draft
- **Custo cai pra $0**, fidelidade Lumi vai pra ~100%

Endpoint `generate-images` (gpt-image-1) **ainda existe no código** mas não é mais chamado pelo UI — pode rollback se mudar de ideia.

### 4. Categorias editoriais (migration 020)
6 categorias com system prompt cirúrgico em `/api/admin/marketing/content/suggest-ideas`:
- `curiosidade` (Você sabia? — fato surpreendente AI/tech/ciência)
- `pesquisa` (paper/release recente — NVIDIA, OpenAI, Anthropic, DeepMind, Nature)
- `educacional` (método de estudo aplicado)
- `opiniao` (crítica fundamentada)
- `dados` (curadoria oficial ENADE/IBGE/Statista)
- `bts` (behind the scenes Lumio)

**Posicionamento atual**: "content brand de curiosidade científica + tech + IA" (NÃO mais só "app de estudos"). Tom: Quanta Magazine + Nerdologia + The Verge + Wired.

### 5. Brand visual Lumi (5+ refinements hoje)
- Doc oficial v2 em `docs/marketing/BRAND_VISUAL_LUMI.md` (source of truth)
- Paleta oficial: `#21113f, #7c3aed, #c026d3, #f3ecff, #fff8e7, #f5c542, #22c55e`
- 13 imagens de referência em `public/instagram/lumi-posts/` (4 ChatGPT oficiais + 9 warmup)
- Brand_anchor em `generate-images/route.ts` constante `BRAND_ANCHOR` (mantido pra fallback API)
- Brand_master no `generate-image-prompt/route.ts` constante `BRAND_MASTER` (ativo agora pro fluxo manual)

## 📊 Custos atuais (Anthropic API + OpenAI texto)
- Suggest-ideas: ~$0.03/chamada (Claude Sonnet 4.6)
- Generate-text multi-rede: ~$0.06/chamada (Claude Sonnet 4.6, gera 4 redes)
- Draft-DM outbound: ~$0.005/chamada (Claude Haiku 4.5)
- Imagens: $0 (manual via assinatura ChatGPT/Claude Max do founder)
- **Volume pesado 8 posts/dia: ~$22/mês total**

## 🔑 Schemas Supabase aplicados
- `018_marketing_outbound.sql` — outbound_drafts, embaixadores, inbox_messages
- `019_content_drafts.sql` — fábrica de conteúdo (idea → content_per_network JSONB → images JSONB → publish_results JSONB)
- `020_content_categories_expand.sql` — categorias `curiosidade` + `pesquisa` adicionadas

## 🔑 Meta infra (Business "Lumio App" id=4173408029656117)

| Ativo | Status | ID |
|-------|--------|----|
| System User `lumio-cli` | ✅ Token gerado | app-scoped `122094825009349877` |
| Pixel `Lumio` | ✅ | `867791183024108` |
| Página FB `Lumio App` | ✅ | `1083170968220797` |
| IG `@lumioapp.br` | ✅ Conectado à Página FB | `17841432871612622` (`META_IG_BUSINESS_ACCOUNT_ID`) |
| Ad Account | ✅ | `act_1448905953408223` |
| App Meta | ✅ | `1496795342023931` (nome interno **CoreMedic** — reuso, ver [[reference-lumio-meta-app-naming]]) |

**Vercel envs production**:
- `META_ACCESS_TOKEN` (10 scopes IG + Pages + Ads + WhatsApp)
- `META_PAGE_ID`, `META_IG_BUSINESS_ACCOUNT_ID`, `META_BUSINESS_ID`, `META_AD_ACCOUNT_ID`
- `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`
- `SUPABASE_*`, `CRON_SECRET`

## 🟡 PENDÊNCIAS — próxima sessão

### Fase 2 (próximo trabalho de código)
1. **`src/lib/publish-x.ts`** — JÁ ESCRITO. OAuth 1.0a + media upload + tweet/thread. Pendente: env vars `X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN`, `X_ACCESS_TOKEN_SECRET`. **User precisa criar app em developer.x.com.**
2. **`src/lib/publish-linkedin.ts`** — não escrito. OAuth 2.0 + asset upload + post API. User precisa criar app em developer.linkedin.com.
3. **Estender `/publish` endpoint** pra incluir X + LinkedIn (atual só IG + FB Page).
4. **`/api/cron/publish-scheduled`** + UI agendamento (cron Vercel + Supabase scheduled_for).

### Ações user-side pendentes
- Aquecer IG: publicar 9 posts em 9 dias (ordem em `docs/marketing/CAPTIONS_LAUNCH.md`)
- Meta Lead Ads R$16/dia → PDF guia (só após Pixel ter ≥50 eventos)
- Criar apps no developer.x.com e developer.linkedin.com (pré-requisito Fase 2)

## 🗂 Arquivos críticos novos (essa sessão)
```
src/app/api/admin/marketing/content/
  ├── drafts/route.ts             (CRUD content_drafts)
  ├── suggest-ideas/route.ts      (Claude Sonnet — 5 ideias por categoria)
  ├── generate-text/route.ts      (Claude Sonnet — multi-rede)
  ├── generate-image-prompt/route.ts   ← NOVO (ativo, gera prompts pra ChatGPT)
  ├── upload-image/route.ts            ← NOVO (multipart → Supabase Storage)
  ├── generate-images/route.ts    (gpt-image-1, INATIVO no UI mas no código)
  └── publish/route.ts            (IG + FB Page Graph API)

src/app/admin/marketing/crescimento/
  ├── page.tsx
  └── client.tsx                  (5 abas, ~2300 linhas)

src/lib/
  ├── publish-x.ts                ← Fase 2 PRONTO mas inativo (sem env vars)
  ├── ig-posts-data.ts            (9 warmup posts hardcoded)
  └── openai-image.ts             (gpt-image-1 wrapper, mantido)

supabase/migrations/
  ├── 018_marketing_outbound.sql
  ├── 019_content_drafts.sql
  └── 020_content_categories_expand.sql

docs/marketing/
  ├── BRAND_VISUAL_LUMI.md        ← Source of truth identidade visual Lumi
  └── CAPTIONS_LAUNCH.md          (9 captions warmup IG)

public/instagram/lumi-posts/
  ├── 01-10 warmup originais.jpg  (9 posts)
  └── ref-lumi-01 a 04.jpg        (4 refs ChatGPT oficiais)
```

## 🧪 Como retomar pós-compact

Testar o fluxo end-to-end:
1. Abre https://lumioapp.net/admin/marketing/crescimento
2. Aba **Estúdio** → **+ Nova ideia** → clica **"Você sabia?"** ou **"Pesquisa recente"** → seleciona uma
3. **"Criar e abrir editor"**
4. PASSO 1: **"Gerar texto"** (15s, Sonnet 4.6 produz IG + X + LinkedIn + TikTok)
5. PASSO 2: descreve cena do Lumi → **"Gerar prompts"** → copia 1 dos 3 prompts → cola no ChatGPT/Gemini → salva imagem → upload no ratio certo
6. Repete pros 3 ratios
7. PASSO 3: **"Publicar IG + FB"** → confirma → vê post live nas 2 redes

Se algo quebrar, log do erro vem via `toast.error()` no frontend.
