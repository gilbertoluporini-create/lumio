# ESTADO — Lumio (identidade visual + sistema de coins consolidados)

> Snapshot que resiste a compact. Última atualização: 2026-05-23.

## Pitch
SaaS de transcrição de aulas (Web Speech API) + chat IA contextual (Claude Haiku) + slides do professor (Vision Sonnet) + resumo correlato + cronograma semanal extraído da grade. Sistema de **Lumio Coins** estilo Replit/ChatGPT. Mascote **Lumi** (lâmpada-criatura) integrado em todo o app. Mercado: estudantes universitários BR.

## Repositório / Infra
- Local: `/Users/gilbertoluporini/lumio`
- GitHub: https://github.com/gilbertoluporini-create/lumio
- Dev: http://localhost:3001
- Domínio escolhido: **lumio.fun** (ainda a comprar)
- Supabase: `pcatjumfdcxuthefixzf.supabase.co` (configurado + migrations rodadas ✅)
- Anthropic: configurado ✅ (com créditos)
- Stripe: pendente
- Resend: pendente

## User principal
- Email: gilbertoluporini@gmail.com
- ID: `1000206d-38bd-431f-b862-ff4a588b00e7`
- Role: admin
- Saldo atual: 50 coins (restaurado após bug)

## Estado: IDENTIDADE VISUAL COMPLETA, SISTEMA DE COINS COM BUG CORRIGIDO

### ✅ Sistema de Coins (Lumio Coins)
- Tabela `coin_transactions` + `profiles.coin_balance` + `coins_reset_at`
- 1 coin = R$ 0,10 (markup 2x sobre custo real)
- Custos: chat 2, slides 16, resumo 14, refine 5, grade horária grátis
- **Chat usa Haiku 4.5** (10x mais barato que Sonnet); Sonnet só pra Vision + resumo
- **Refund automático** em falha de extract-slides em 2 cenários:
  - Catch geral (API error)
  - Parsing vazio/inválido (slides == 0)
- Trigger SQL dá 50 coins de boas-vindas a novo profile
- Welcome bonus retroativo aplicado em usuários antigos
- `maxDuration` configurado: chat 60s, correlate 120s, extract-slides 300s
- Stripe webhook credita coins do plano em checkout E em invoice.paid (renovação)

### ✅ Pricing aprovado
- Free: R$ 0 / 50 coins one-time (welcome)
- Starter: R$ 29/mês / 250 coins
- Pro: R$ 49/mês / 600 coins ⭐
- Power: R$ 89/mês / 1500 coins
- Top-ups: 100/R$12, 500/R$50 (-17%), 1500/R$120 (-33%)

### ✅ Cronograma
- `subjects.schedule JSONB` armazena dias/horários por matéria
- `/api/extract-schedule` retorna `{name, schedule: [{dayOfWeek, startTime, endTime, room?}]}`
- Rota `/schedule` com grade visual seg-sex (ou seg-sáb) × 7h-23h
- Onboarding salva schedule junto

### ✅ Identidade visual — Lumi (mascote)
- 11 moods do personagem: default, thinking, studying, celebrating, sleeping, recording, confused, waving, coins, reading-pdf, generating
- 4 cenas contextuais: hero-desk (mesa estudante), writing-notes, calendar, funnel-summary
- 8 stickers decorativos: stars-1, stars-2, pencils, books, coffee, bulbs, papers, stationery
- Todas as imagens com **fundo transparente real** (processadas via rembg + u2net local)
- Componentes: `<LumiCharacter>`, `<LumiScene>`, `<LumiSticker>`
- Animações: `lumi-float`, `lumi-glow`

### ✅ Lumio Coin (moeda)
- `<LumioCoin size>` — SVG único minimalista flat (gradient sutil + "L" Instrument Serif italic). Usado em todo o app: sidebar nav, balance card (size 88), badges de custo, top-ups, fallback de histórico de transações.
- Versão 3D animada foi removida (não convenceu visualmente).

### ✅ Identidade visual — sistema
- **Fonte principal**: Bricolage Grotesque (Google Font variable, weights 300-700) substituiu Geist
- **Fonte editorial**: Instrument Serif (italics) — mantido
- **Fonte mono**: Geist Mono — mantido
- **Lucide icons**: aplicado strokeWidth 1.6 global via CSS `.lucide` (foge do default 2)
- **Sombras roxas customizadas**: `.shadow-lumio-sm/md/lg/xl` (oklch 285)
- **Favicon**: `src/app/icon.png` gerado do lumi-default
- **OG image**: `public/og-image.png` 1200×630
- Metadata SEO completa: OG + Twitter cards + pt_BR locale

### ✅ Sidebar lateral colapsável
- Substituiu nav horizontal
- 3 items: Aulas, Cronograma, Lumio Coins (com saldo inline)
- Toggle collapse persistente (localStorage)
- Mobile: drawer com overlay backdrop
- DropdownMenu do user habilitado: Perfil, Configurações, Assinatura, Sair

### ✅ Páginas criadas
- `/account/profile` — editar nome (Supabase update direto), avatar, info da conta
- `/account/settings` — tema (light/dark/system), notificações (localStorage), idioma, "excluir conta" (CTA pra email)

### ✅ Lumi integrado em
- Landing: peeking no hero + seção dedicada "Conheça o Lumi" + nova seção "Em ação" com scene-hero-desk
- Auth (signup/login): waving + celebrating
- Onboarding: scene writing-notes
- Dashboard empty: waving
- Schedule empty: scene calendar
- Coins empty history: sleeping
- Coins balance: LumioCoin SVG estático (88px)
- Lecture transcript: default (ou recording AO VIVO)
- Lecture chat empty: thinking
- Lecture slides empty: reading-pdf (ou generating em loading)
- Lecture summary loading: scene funnel-summary
- Lecture summary empty: thinking
- Success page: celebrating

### ✅ Fix scroll bug
- Lenis (smooth scroll) bloqueava scroll nas páginas autenticadas
- Agora só ativa em `/`, `/pricing`, `/success`
- Outras rotas usam scroll nativo

### 🐛 BUG conhecido (corrigido)
- **Perda de 32 coins em extract-slides**: usuário foi cobrado 2x sem receber slides (PDF 3.9MB)
- Causa: dev server ou Anthropic timeout em PDF grande sem trigger do catch
- Fixes aplicados:
  - `maxDuration = 300` no route
  - Refund automático no caminho de "parsing vazio" (não só no catch)
  - Coins restaurados manualmente (saldo: 50)

### 🚨 PENDENTE — bloqueios pra subir
1. **Stripe**: setup completo (3 Price IDs: STARTER R$29, PRO R$49, POWER R$89 mensais BRL) + webhook URL + Customer Portal config
2. **Resend**: API key + domínio verificado pra emails transacionais
3. **Domínio**: comprar lumio.fun (~R$60/ano)
4. **LGPD**: termos de uso + política de privacidade
5. **Confidencialidade fundador**: statement descriptor Stripe + privacy WHOIS no domínio
6. **Deploy Vercel**: env vars, atualizar Supabase Site URL + webhook URL Stripe

### 🎨 Pacotes de polish pendentes (user pediu)
- Pacote 2: Phosphor duotone icons OR custom Lumi icons (10-15 ícones core); 404 page com Lumi confused; toasts com mini-Lumi; underlines animados
- Pacote 3: Sound design opt-in, cursor customizado, handwriting font em annotations

## Stack final
- Next.js 16.2.6 (App Router, Turbopack, proxy.ts)
- React 19.2.4 + TS estrito (npx tsc --noEmit passa limpo)
- Tailwind 4.3
- **Bricolage Grotesque** (sans, novo) + **Instrument Serif** (italic) + **Geist Mono**
- Framer Motion 12 + Lenis (apenas rotas públicas)
- Radix UI + Lucide (strokeWidth 1.6)
- @anthropic-ai/sdk:
  - Haiku 4.5 → /api/chat
  - Sonnet 4.5 → /api/correlate, /api/extract-slides, /api/extract-schedule
- @supabase/ssr + @supabase/supabase-js
- stripe + @stripe/stripe-js
- resend
- pdfjs-dist 5.7 (worker local em /public/pdf.worker.min.mjs)
- zod

## Rotas

| Rota | Tipo | Auth | Descrição |
|---|---|---|---|
| `/` | static | public | Landing |
| `/pricing` | static | public | Planos |
| `/success` | static | public | Pós-checkout |
| `/login`, `/signup` | static | public | Auth |
| `/auth/callback` | route | — | Supabase OAuth |
| `/onboarding` | static | auth | Wizard matérias + grade |
| `/dashboard` | static | auth | Lista aulas |
| `/lecture/[id]` | dynamic | auth | Gravar/ver aula |
| `/schedule` | static | auth | Cronograma semanal |
| `/account/profile` | static | auth | **NOVO** Editar perfil |
| `/account/settings` | static | auth | **NOVO** Tema + notificações |
| `/account/coins` | static | auth | Saldo + histórico + top-ups |
| `/account/billing` | static | auth | Customer Portal |
| `/admin` | dynamic | admin | Métricas |
| `/api/health` | route | public | Status integrações |
| `/api/coins` | route | auth | GET saldo/histórico |
| `/api/chat` | route | auth + coins (2) | Streaming Haiku, max 60s |
| `/api/correlate` | route | auth + coins (14) | JSON resumo, max 120s |
| `/api/extract-slides` | route | auth + coins (16) | Vision PDF, max 300s |
| `/api/extract-schedule` | route | auth | Vision grade |
| `/api/checkout` | route | auth | Stripe Session |
| `/api/portal` | route | auth | Customer Portal |
| `/api/stripe/webhook` | route | sig | Webhook + credit coins |
| `/api/auth/magic-link` | route | public | Magic link |

## Comandos

```bash
cd /Users/gilbertoluporini/lumio
npm run dev                       # localhost:3001
npx tsc --noEmit                  # type check
curl http://localhost:3001/api/health
bash /tmp/lumio-coin-debug.sh     # debug script: saldo + histórico de transações
```

## Decisões importantes da sessão

- **1 coin = R$ 0,10** (mental simples). Markup 2x sobre custo real Anthropic.
- **Haiku no chat / Sonnet nos pesados** = margem positiva em todos os tiers.
- **Coins debitam ANTES do processamento, refund automático** se algo falha (catch + parsing vazio).
- **maxDuration** explícito em todos os endpoints de IA.
- **Lenis disabled** em rotas autenticadas (resolve scroll bug).
- **Bricolage Grotesque + Lucide strokeWidth 1.6 + sombras roxas** = identidade visual única (fora do template SaaS de IA).
- **LumioCoin 2 versões**: SVG flat inline + PNG 3D animado pra destaques.
- **Sidebar vertical colapsável** com saldo inline (não horizontal nav).
- **Stickers + cenas + mascote** dão a personalidade própria do app.
