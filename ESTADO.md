# ESTADO — Lumio (snapshot pós-noite-de-trabalho-autônoma)

> Última atualização: 2026-05-23 (madrugada). Snapshot que resiste a compact.

## Pitch
SaaS de transcrição de aulas (Web Speech API) + chat IA contextual (Claude Haiku) + slides do professor (Vision Sonnet) + **produtos gerados** (resumos, flash cards, quiz, mapa mental) que ficam organizados em **subpastas por aula → matéria**. Mascote **Lumi** (lâmpada-criatura) e moeda **Lumio Coin** (3D roxa com "+") em todo o app. Mercado: estudantes universitários BR.

## Repositório / Infra
- Local: `/Users/gilbertoluporini/lumio`
- GitHub: https://github.com/gilbertoluporini-create/lumio
- Dev: http://localhost:3001
- Domínio: **lumio.fun** (a comprar)
- Supabase: `pcatjumfdcxuthefixzf.supabase.co` (configurado, migrations parcialmente rodadas — VER PENDÊNCIAS)
- Anthropic: configurado ✅
- Stripe: pendente
- Resend: pendente

## User principal
- Email: gilbertoluporini@gmail.com
- ID: `1000206d-38bd-431f-b862-ff4a588b00e7`
- Role: admin
- Saldo: 50 coins

---

## 🚨 PRIMEIRA COISA AO ACORDAR — rodar migration nova

**Abrir Supabase SQL Editor e colar `/Users/gilbertoluporini/lumio/supabase/migrations.sql` inteiro.** Ela é idempotente. Sem isso:
- `monthly_lectures_used` / `monthly_lectures_reset_at` não existem → criar aula vai falhar
- Tabela `lecture_assets` não existe → gerar resumo / flashcards salva mas asset insert falha (silencioso, mas histórico em /products fica vazio)

A migration adiciona:
1. `profiles.monthly_lectures_used` + `monthly_lectures_reset_at`
2. Tabela `lecture_assets` (id, lecture_id, user_id, kind, payload, coins_spent) + RLS owner-only + trigger updated_at
3. Comentário com policies de Storage pra bucket `lecture-uploads` (criar depois manualmente)

---

## Estado: REDESIGN COMPLETO + PRICING V2 + PRODUTOS GERADOS + SECURITY

### ✅ Pricing v2 (mudança estratégica)
**Filosofia**: ferramentas basais (chat, slides, transcrição) GRÁTIS no plano. Coins servem pra produzir **assets** que ficam salvos como subpasta da aula.

| Plano | Preço | Aulas/mês | Coins/mês |
|-------|-------|-----------|-----------|
| Free | R$ 0 | 3 | 30 |
| Starter | **R$ 39** | 20 | 200 |
| Pro ⭐ | **R$ 69** | 100 (efetivo ∞) | 500 |
| Power | **R$ 119** | ilimitado (999) | 1500 |

**Coin costs novos:**
- chat_message: **0** (grátis)
- extract_slides: **0** (grátis)
- transcript_refine: **0** (grátis)
- summary: **10** (resumo estruturado)
- flashcards: **12** (set de 10 cards)
- quiz: **15** (em breve)
- mindmap: **20** (em breve)

Implementado em `src/lib/coins.ts` (COIN_COSTS) e `src/lib/stripe.ts` (PLAN_COINS_PER_MONTH + PLAN_LECTURE_LIMIT). Pricing section da landing reescrita.

### ✅ Limite mensal de aulas (server-side gate)
- `src/app/api/lectures/create/route.ts` — novo endpoint que:
  - Verifica plano ativo do user (subscriptions table)
  - Lê `monthly_lectures_used` + `monthly_lectures_reset_at` de profiles
  - Reseta automaticamente se passaram >30 dias
  - Bloqueia se >= PLAN_LECTURE_LIMIT[plan]
  - Cria a aula + incrementa contador
- `createLectureAsync` no client agora chama esse endpoint (não Supabase direto)

### ✅ Sistema de Produtos Gerados (subpastas da aula)
- Tabela `lecture_assets` com kind: 'summary' | 'flashcards' | 'quiz' | 'mindmap'
- payload JSONB armazena o asset completo
- coins_spent registra custo
- RLS owner-only via auth.uid()
- Endpoint GET `/api/lectures/[id]/assets` retorna todos os assets da aula
- `/api/correlate` agora salva resumo como asset (além de lectures.summary)
- `/api/flashcards` (NOVO!) — Sonnet 4.5 gera 5-20 cards com pergunta/resposta/hint/difficulty

### ✅ Rota `/lecture/[id]/products`
- Grid 2x2 com cards: Resumo · Flash cards · Quiz · Mindmap
- Botão "Gerar" chama endpoint, salva como asset, refresca
- Botão "Abrir" mostra viewer inline (LectureSummaryView / FlashcardsView)
- Histórico de assets gerados embaixo (clicável)
- Quiz e Mindmap marcados "Em breve"

### ✅ Componente FlashcardsView (viewer interativo)
- Flip card (pergunta ↔ resposta)
- Hint opcional, badge difficulty (Fácil/Médio/Difícil)
- Progress bar
- Atalhos: ←/→ navega, espaço/enter flipa, h pista
- Botão "Recomeçar"

### ✅ Organização hierárquica
- **Dashboard redesenhado**: stats row (próxima aula + aulas + tempo) + grid de pastas-matéria + aulas recentes
- **`/subject/[id]`** (nova rota): aulas como subpastas, cada uma com 4 features clicáveis (Transcrição/Slides/Dúvidas/Produtos)
- **Deep links nas tabs**: `?tab=transcript|slides|qa|summary` no /lecture/[id]
- **`/documents`** (nova rota): tree por matéria, search + filtros (Tudo/Aulas/Gerados/Uploadados)

### ✅ Identidade visual completa

**Lumi (mascote, 11 moods)**: default, thinking, studying, celebrating, sleeping, recording, confused, waving, coins, reading-pdf, generating + 4 cenas (hero-desk, writing-notes, calendar, funnel-summary) + 8 stickers. Componentes `<LumiCharacter>`, `<LumiScene>`, `<LumiSticker>`. Animações `lumi-float`, `lumi-glow`.

**Lumio Coin (moeda)**: PNG 3D roxa com "+" processada via rembg (alpha real), padding generoso. `<LumioCoin size>` SVG → reescrito pra `<img>` puro com `objectFit: contain` (Next/Image cacheava errado). Caminho: `public/illustrations/lumio-coin.png` (1521×1521).

**LumiIcon (18 ícones 3D oficiais)**: book, calendar, chat, clock, document, layers, mic, sparkle, trophy, plus, trash, settings, search, heart, download, upload, bell, lock. Em `public/illustrations/icons/`. Componente `<LumiIcon name="..." size={N} />`. Originais em `_originals/icons/`.

**Substituições aplicadas**: sidebar nav (Aulas, Cronograma, Documentos), dashboard stats, subject folders, FeatureTab do subject, landing (steps + produtos + personas). Lucide mantido em botões pequenos e dropdowns (strokeWidth 1.6 global).

### ✅ Fontes e sistema
- **Bricolage Grotesque** (sans, Google Font variable) substitui Geist
- **Instrument Serif** (italic editorial)
- **Geist Mono** (números/código)
- Sombras roxas customizadas `.shadow-lumio-sm/md/lg/xl`
- Favicon: `src/app/icon.png`
- OG image: `public/og-image.png` 1200×630

### ✅ Sidebar lateral + Command Palette
- Sidebar vertical colapsável (localStorage persistente)
- 4 itens: Aulas, Cronograma, **Documentos** (novo), Lumio Coins
- Saldo de coins inline (com badge âmbar se baixo)
- Dropdown user: Perfil, Configurações, Assinatura, Sair
- **Cmd+K / Ctrl+K** abre Command Palette com busca de aulas/matérias/ações + nav teclado (↑↓ Enter)
- Botão visível no topbar com kbd "⌘K"

### ✅ Páginas /account
- `/account/profile` — editar nome (Supabase update), avatar, info
- `/account/settings` — tema (light/dark/system), notificações (localStorage), idioma, danger zone (CTA email pra excluir conta)
- `/account/coins` — balance card grande com LumioCoin 140px, histórico, top-ups, custos por feature
- `/account/billing` — Customer Portal (Stripe)

### ✅ Landing page profissional
- SpotlightCursor removido (era causa de bug perceptível)
- Hero com Lumi peeking + LiveDemo
- Marquee atualizado pra incluir "Resumos · Flash cards · Quizzes · Mapas mentais"
- Seção **Produtos gerados** (4 cards explicando coins por feature)
- Steps com ícones 3D
- Personas com ícones 3D heart/book/trophy
- Cena "hero-desk" do Lumi
- Pricing v2

### ✅ 404 page customizada
- `src/app/not-found.tsx`
- Lumi confused no centro
- CTAs: voltar ao dashboard / página inicial

### ✅ Segurança (security audit)
**Rate limiting in-memory** (`src/lib/rate-limit.ts`):
- chat: 30/min/IP + 60/min/user
- flashcards: 5/min/IP + 10/min/user
- correlate: 5/min/IP + 10/min/user
- extract-slides: 3/min/IP + 5/min/user
- lectures/create: 10/min/IP
- 429 com `Retry-After` header

**Anti-IDOR** (`src/lib/lecture-auth.ts`):
- `assertLectureOwnership(userId, lectureId)` antes de operações sensíveis
- Aplicado em /api/flashcards e /api/correlate (quando lectureId)
- /api/lectures/[id]/assets usa RLS Postgres owner-only

**Headers** (`next.config.ts` já estava OK):
- CSP whitelisted (Stripe, Supabase, Anthropic)
- X-Frame-Options DENY
- HSTS em prod (1 ano + preload)
- Permissions-Policy: camera (), microphone (self), geolocation (), payment (self)
- frame-ancestors 'none'

### ✅ Streak (gamification)
- `src/lib/streak.ts` calcula client-side
- Badge âmbar 🔥 no header do dashboard
- "Você já estudou hoje. Tô orgulhoso." quando todayDone
- "Pronto pra estudar?" quando não

### ✅ Cores diversificadas no cronograma
- Bug raiz no onboarding: `subjects.length` stale dentro de loop fazia tudo cair na mesma cor
- Fix: batch único `setSubjects(prev => [...prev, ...newOnes])` com cor por índice
- Botão "Diversificar cores" no `/schedule` reatribui pra users existentes (atalho)
- Endpoint `updateSubjectColorAsync` em `src/lib/db.ts`

### ✅ Sistema de Coins (legado mantido)
- Tabela `coin_transactions` + `profiles.coin_balance` + `coins_reset_at`
- 1 coin = R$ 0,10 (markup 2x)
- Trigger SQL dá 50 coins de boas-vindas (será 30 após nova migration final)
- Welcome bonus retroativo já aplicado
- `maxDuration` em todos AI endpoints (chat 60s, correlate 120s, extract-slides 300s, flashcards 120s)
- Stripe webhook credita coins em checkout + invoice.paid (renovação)

### 🐛 BUG histórico (corrigido)
- Perda de 32 coins em extract-slides timeout. Restaurado manualmente. Fixes: maxDuration 300s + refund automático em catch E em parsing-empty path.

---

## 🚨 PENDENTE pra subir o app

### CRÍTICO (rodar antes de qualquer teste)
1. **Migration `monthly_lectures_used` + `lecture_assets`** → SQL Editor Supabase
   - Sem ela, criar aula falha (endpoint /api/lectures/create) e produtos não viram assets

### Antes de monetizar
2. **Stripe**: criar 3 Price IDs (STARTER R$39, PRO R$69, POWER R$119 monthly BRL) + atualizar webhook URL + Customer Portal config + statement descriptor anônimo
3. **Resend**: API key + domínio verificado
4. **Domínio**: comprar lumio.fun (~R$60/ano)
5. **LGPD**: termos de uso + política de privacidade
6. **Privacy fundador**: WHOIS privacy + statement descriptor "Lumio Studios" (não nome real)
7. **Deploy Vercel**: env vars + atualizar Supabase Site URL + webhook URL Stripe

### Bucket Storage (PDFs originais — Fase 2 da hierarquia)
- Criar bucket `lecture-uploads` (private) no Supabase Dashboard
- Aplicar policies do final do `migrations.sql` (estão comentadas — descomentar e rodar)
- Modificar `/api/extract-slides` pra salvar PDF original em `${userId}/${lectureId}/${filename}`
- Listar PDFs na aba "Uploadados" do `/documents`

### Features prontas pra implementar
- Endpoint /api/quiz (mesmo padrão de flashcards, falta UI)
- Endpoint /api/mindmap
- Onboarding tour interativo (primeira vez no dashboard)
- Sound design opt-in (achievement, finish recording)
- Export resumo como PDF (já tem MD)

---

## Stack final
- Next.js 16.2.6 (App Router, Turbopack, proxy.ts)
- React 19.2.4 + TS estrito (npx tsc --noEmit passa limpo)
- Tailwind 4.3
- **Bricolage Grotesque** + **Instrument Serif** + **Geist Mono**
- Framer Motion 12 + Lenis (apenas rotas públicas /, /pricing, /success)
- Radix UI + Lucide (strokeWidth 1.6) + **LumiIcon** (3D)
- @anthropic-ai/sdk:
  - Haiku 4.5 → /api/chat
  - Sonnet 4.5 → /api/correlate, /api/extract-slides, /api/extract-schedule, **/api/flashcards**
- @supabase/ssr + @supabase/supabase-js
- stripe + @stripe/stripe-js
- resend
- pdfjs-dist 5.7 (worker local em /public/pdf.worker.min.mjs)
- zod
- **rembg + onnxruntime + u2net** (local Python pra processar PNGs do GPT Image)

## Rotas (atualizado)

| Rota | Tipo | Auth | Descrição |
|---|---|---|---|
| `/` | static | public | Landing redesenhada |
| `/pricing` | static | public | Planos v2 |
| `/success` | static | public | Pós-checkout |
| `/login`, `/signup` | static | public | Auth |
| `/auth/callback` | route | — | Supabase OAuth |
| `/onboarding` | static | auth | Wizard matérias + grade |
| `/dashboard` | static | auth | **NOVO** Pastas-matéria + stats + streak |
| `/subject/[id]` | dynamic | auth | **NOVO** Aulas como subpastas |
| `/lecture/[id]` | dynamic | auth | Aula + tabs (?tab=...) |
| `/lecture/[id]/products` | dynamic | auth | **NOVO** Produtos gerados |
| `/schedule` | static | auth | Cronograma + "Diversificar cores" |
| `/documents` | static | auth | **NOVO** Tree por matéria |
| `/account/profile` | static | auth | Editar perfil |
| `/account/settings` | static | auth | Tema + notif |
| `/account/coins` | static | auth | Saldo + histórico + top-ups |
| `/account/billing` | static | auth | Customer Portal |
| `/admin` | dynamic | admin | Métricas |
| `/api/health` | route | public | Status integrações |
| `/api/coins` | route | auth | GET saldo/histórico |
| `/api/chat` | route | auth + rate-limit | Streaming Haiku, 60s, GRÁTIS |
| `/api/correlate` | route | auth + coins(10) + rate-limit | JSON resumo, 120s, salva asset |
| `/api/flashcards` | route | auth + coins(12) + rate-limit | **NOVO** Set cards, 120s, salva asset |
| `/api/extract-slides` | route | auth + rate-limit | Vision PDF, 300s, GRÁTIS |
| `/api/extract-schedule` | route | auth | Vision grade |
| `/api/lectures/create` | route | auth + rate-limit + monthly gate | **NOVO** Cria aula com limit do plano |
| `/api/lectures/[id]/assets` | route | auth (RLS) | **NOVO** GET assets da aula |
| `/api/checkout` | route | auth | Stripe Session |
| `/api/portal` | route | auth | Customer Portal |
| `/api/stripe/webhook` | route | sig | Webhook + credit coins |
| `/api/auth/magic-link` | route | public | Magic link |

## Comandos

```bash
cd /Users/gilbertoluporini/lumio
npm run dev                       # localhost:3001
npx tsc --noEmit                  # type check (passa limpo)
curl http://localhost:3001/api/health
bash /tmp/lumio-coin-debug.sh     # debug script: saldo + histórico de transações
```

## Decisões importantes da noite

- **Coins viram "moeda criativa"**: chat/slides/transcrição grátis. Coins SÓ pra produtos gerados (resumo/flashcards/quiz/mindmap).
- **Pricing reajustado**: Free R$0 / Starter R$39 / Pro R$69 / Power R$119 — cobre custo Anthropic incluído no plano.
- **Limite mensal de aulas**: 3 / 20 / 100 / ilimitado — proteção da margem.
- **Produtos como assets**: tabela `lecture_assets` salva resumo + flashcards + quiz + mindmap com payload JSONB.
- **`<LumioCoin>` virou PNG 3D com "+"** (era SVG com L) processado via rembg, padding 40%.
- **18 ícones 3D oficiais (LumiIcon)** processados via rembg, substituem Lucide em pontos de destaque.
- **Rate limit in-memory** (1ª linha de defesa) por IP e user.
- **Anti-IDOR**: assertLectureOwnership antes de operações sensíveis.
- **Cmd+K palette** em todas as rotas autenticadas.
- **Streak** calculado client-side da lista de lectures.
- **Landing**: removido SpotlightCursor (bug de cursor). Mais clean. Seção Produtos integrada.
