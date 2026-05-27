# Lumio — ESTADO

## 🟢 SESSÃO 2026-05-27 madrugada (prep-compact) — ESTÚDIO MULTI-REDE LIVE

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
