# ESTADO — Lumio (MVP pronto pra piloto pago)

> Snapshot que resiste a compact.

## Pitch
SaaS de transcrição de aulas (Web Speech API) + chat IA contextual (Claude) + slides do professor (Vision) + resumo correlato. Mercado: estudantes universitários BR. Cobrança mensal/anual via Stripe (PIX + cartão).

## Repositório
- Local: `/Users/gilbertoluporini/lumio`
- GitHub: https://github.com/gilbertoluporini-create/lumio

## Estado atual: READY FOR PILOT

Reality Check passou pela 2ª iteração com BLOCKERs corrigidos.

### Pronto e validado
- ✅ Landing premium editorial (Lenis, Magnetic, Spotlight, Highlighter, Bento)
- ✅ Auth dual mode: Supabase magic link OU localStorage (dev fallback)
- ✅ Onboarding com upload de grade horária (Claude Vision)
- ✅ Dashboard + Lecture page (transcrição ao vivo + chat IA + slides PDF + resumo estruturado)
- ✅ Auto-resumo ao parar gravação
- ✅ Storage adapter unificado (`lib/db.ts`): Supabase quando configurado, localStorage fallback
- ✅ Pricing page com Stripe Checkout
- ✅ Webhook Stripe **idempotência correta** (process FIRST, marker AFTER, delete on fail)
- ✅ Welcome email com **magic link gerado via Supabase Admin** (user paga → email com link → entra direto)
- ✅ `current_period_end` lido tanto do root quanto do item-level (Stripe API ≥ 2025-03)
- ✅ Subscription gate em `/api/correlate` (402 + upgrade hint) sem bypass quando Supabase configurado
- ✅ Billing page + Stripe Customer Portal (`/account/billing` + `/api/portal`)
- ✅ Admin dashboard `/admin` server-side (role no DB + ADMIN_EMAILS fallback)
- ✅ `/api/health` pra monitoring/uptime
- ✅ CSP + rate limit (com GC) + magic byte sniff + prompt injection guard
- ✅ Build limpo (zero TS errors)
- ✅ 20 rotas funcionando

### Reality Check P0 fixes aplicados (issues #1, #4, #5, #6, #7, #11, #14)

| # | Issue | Fix |
|---|---|---|
| 1 | Welcome sem magic link | `generateLink('magiclink')` via Admin API, passado pro email |
| 4 | ADMIN_EMAILS hardcoded | Removido do `.env.example`, fica vazio |
| 5 | Sub gate bypass sem service role | Retorna 503 (config incompleta) ao invés de skip |
| 6 | Webhook race FK | Welcome só envia se profile existe (trigger DB cria) |
| 7 | Idempotência invertida | Reserva → processa → marca processed_at. Falha = DELETE reserve. |
| 11 | Resend sandbox em prod | Warning loud no boot quando NODE_ENV=production e FROM contém resend.dev |
| 14 | current_period_end errado | Lê de item-level (novo) com fallback pro root (legacy) |

### Pendente (não-bloqueante MVP, mas roadmap)

- IndexedDB pra slides grandes (localStorage ~5MB quota)
- Upstash Redis pra rate limit cross-instance
- LGPD: termos + política de privacidade
- Sentry pra error tracking + PostHog analytics
- Optimistic lock em messages JSONB pra multi-aba (raro em single device)
- CSP `unsafe-inline` em script-src: necessário pro framer-motion runtime;
  remover quando migrar pra Motion + classes utilitárias

## Stack final
- Next.js 16.2.6 (Turbopack, App Router, proxy.ts)
- React 19.2.4 + TypeScript estrito
- Tailwind 4.3 + Instrument Serif + @tailwindcss/typography + tw-animate-css
- Framer Motion 12 + Lenis smooth scroll
- Radix UI (Dialog, Popover, Dropdown, Avatar, Separator, ScrollArea)
- Lucide icons + react-markdown + remark-gfm
- @anthropic-ai/sdk (claude-sonnet-4-5-20250929 + cache_control)
- @supabase/ssr + @supabase/supabase-js (PKCE magic link + Postgres + RLS)
- stripe + @stripe/stripe-js (Checkout + Subscriptions + Customer Portal + Webhooks)
- resend (welcome + receipt)
- pdfjs-dist 5.7 (client-side rasterization)
- zod (validation)

## Rotas (20 total)

| Rota | Tipo | Auth | Descrição |
|---|---|---|---|
| `/` | static | public | Landing |
| `/pricing` | static | public | Planos + Stripe checkout |
| `/success` | static | public | Pós-checkout |
| `/login`, `/signup` | static | public | Auth |
| `/auth/callback` | route | — | Supabase OAuth callback |
| `/onboarding` | static | auth | Wizard matérias |
| `/dashboard` | static | auth | Lista aulas |
| `/lecture/[id]` | dynamic | auth | Gravar/ver aula |
| `/account/billing` | static | auth | Plano + Customer Portal |
| `/admin` | dynamic | admin role | Métricas + usuários |
| `/api/health` | route | public | Status integrações |
| `/api/chat` | route | auth + RL | Streaming Claude |
| `/api/correlate` | route | auth + sub | JSON resumo (premium) |
| `/api/extract-slides` | route | auth + RL | Vision extract PDF |
| `/api/extract-schedule` | route | auth + RL | Vision extract grade |
| `/api/checkout` | route | auth | Cria Stripe Session |
| `/api/portal` | route | auth | Customer Portal session |
| `/api/stripe/webhook` | route | sig verify | Webhook handler |
| `/api/auth/magic-link` | route | public | Solicita magic link |

## Comandos

```bash
cd /Users/gilbertoluporini/lumio
npm run dev       # localhost:3001
npm run build     # validação TS + bundle
curl http://localhost:3001/api/health   # status integrações
git status
```

## Setup pra produção

Ver `SETUP.md` — checklist 30-45 min do zero ao deploy + validação de webhook E2E com Stripe CLI.

## Decisões de arquitetura

- **Supabase client retorna `any`** intencionalmente — tipos profundos do supabase-js geram `never` em inserts genéricos. Tipagem fica em call-sites.
- **Webhook idempotência via reserve-then-process** ao invés de event-id PK como gate — permite recovery quando processing falha.
- **Service role usado APENAS em route handlers** (server-only). Anon key pra client/RLS-protected reads.
- **Stripe Customer Portal** ao invés de cancel via API próprio — Stripe-hosted = mantido pelo Stripe.
- **localStorage como fallback transparente** — adapter resolve em runtime. Permite dev sem credenciais.
