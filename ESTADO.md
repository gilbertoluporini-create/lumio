# ESTADO — Lumio (MVP pronto pra vender)

> Snapshot que resiste a compact.

## Pitch
SaaS de transcrição de aulas (Web Speech API) + chat IA contextual (Claude) + slides do professor (Vision) + resumo correlato. Mercado: estudantes universitários BR. Cobrança mensal/anual via Stripe (PIX + cartão).

## Repositório
- Local: `/Users/gilbertoluporini/lumio`
- GitHub: https://github.com/gilbertoluporini-create/lumio

## Estado: PRONTO pra plugar credenciais e vender

### Pronto e testado em build
- ✅ Landing premium editorial (Instrument Serif, Lenis smooth scroll, Magnetic CTAs, Spotlight cursor, ink-bleed highlighter, bento grid, demo viva typing, paper texture, logos row, pricing inline, FAQ)
- ✅ Auth: signup/login com magic link Supabase (Resend pra welcome/recibo)
- ✅ Fallback offline (localStorage) quando Supabase não configurado
- ✅ Onboarding: matérias livres + upload grade horária via Claude Vision
- ✅ Dashboard com filtro por matéria + criação inline
- ✅ Lecture page: transcrição ao vivo + chat IA streaming + slides PDF anexáveis (pdfjs no client) + Claude Vision pra extrair texto
- ✅ Tela de Resumo estruturado: cada slide com imagem + conteúdo falado + Q&A correlato
- ✅ Auto-gera resumo ao pausar gravação
- ✅ Export `.md` do resumo
- ✅ Pricing page (3 tiers: Free / Pro R$19/mês / Anual R$149)
- ✅ Stripe Checkout endpoint (sessão hosted, BRL, PT-BR, PIX habilitável)
- ✅ Stripe webhook handler com signature verification + idempotência
- ✅ Welcome email + recibo via Resend
- ✅ Success page pós-checkout
- ✅ Admin dashboard `/admin` server-side, role no DB + ADMIN_EMAILS fallback
  - Métricas: usuários totais, assinaturas ativas, MRR estimado, aulas
  - Tabela de últimos cadastros
- ✅ Proxy (Next 16) com rate limit 30 req/min/user em /api/chat, /api/correlate, /api/extract-*
- ✅ CSP headers + X-Frame-Options + HSTS + Permissions-Policy
- ✅ Magic byte sniff em uploads (anti MIME spoof)
- ✅ PDF bomb detection
- ✅ Prompt injection guard (`<untrusted_*>` tags + escape)
- ✅ Error sanitization (não vaza stack trace no client)
- ✅ Modelo Claude pinned: `claude-sonnet-4-5-20250929` + cache_control
- ✅ Code review fixes: timer real-delta, race condition stop→summary com refs
- ✅ Build limpo (zero TS errors)

### Pendente — só requer credenciais

- ⏳ Criar contas (Supabase, Stripe, Resend) — ~15 min total
- ⏳ Rodar `supabase/schema.sql` no SQL Editor
- ⏳ Setar env vars em `.env.local` (template em `.env.example`)
- ⏳ `update profiles set role='admin' where email='gilbertoluporini@gmail.com';` após primeiro login
- ⏳ Deploy Vercel

Tudo documentado em `SETUP.md`.

## Stack final
- Next.js 16.2.6 (Turbopack, App Router, proxy.ts)
- React 19.2.4
- Tailwind 4.3 + Instrument Serif + @tailwindcss/typography + tw-animate-css
- Framer Motion 12 + Lenis smooth scroll
- Radix UI (Dialog, Popover, Dropdown, Avatar, etc.)
- Lucide icons + react-markdown + remark-gfm
- @anthropic-ai/sdk (Claude Sonnet 4.5 streaming)
- @supabase/ssr + @supabase/supabase-js (Auth magic link + Postgres + RLS)
- stripe + @stripe/stripe-js (Checkout + Subscriptions + Webhooks)
- resend (emails transacionais)
- pdfjs-dist 5.7 (client-side rasterization)
- zod (validation)

## Rotas

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
| `/admin` | dynamic | admin role | Métricas + usuários |
| `/api/chat` | route | auth + RL | Streaming Claude |
| `/api/correlate` | route | auth + RL | JSON estruturado de resumo |
| `/api/extract-slides` | route | auth + RL | Vision extract PDF |
| `/api/extract-schedule` | route | auth + RL | Vision extract grade horária |
| `/api/checkout` | route | auth | Cria Stripe Checkout Session |
| `/api/stripe/webhook` | route | sig verify | Stripe webhook handler |
| `/api/auth/magic-link` | route | public | Solicita magic link |

## Segurança aplicada (security audit checklist)

- ✅ Auth obrigatório em /api/chat, /correlate, /extract-* (via proxy)
- ✅ Rate limit 30/min/user em rotas LLM
- ✅ Magic byte sniff em uploads
- ✅ Tamanho máximo PDF 20MB, image 10MB
- ✅ PDF bomb detection (>100 páginas)
- ✅ Prompt injection guard com escape + tags <untrusted_*>
- ✅ Stack traces sanitizados (reqId vai pra log server-only)
- ✅ Modelo Claude pinned (snapshot date) + cache_control
- ✅ Webhook Stripe com signature verification + idempotência (stripe_events PK)
- ✅ PKCE flow no Supabase magic link
- ✅ Open-redirect guard no auth/callback
- ✅ Admin gated por role no DB (defense in depth + ADMIN_EMAILS)
- ✅ RLS Supabase em todas as tabelas user-owned + with check
- ✅ Self-promote bloqueado via policy (role precisa = role atual no UPDATE)
- ✅ Service role usado APENAS em route handlers
- ✅ CSP headers + X-Frame-Options + HSTS

## Bugs corrigidos do code review

- ✅ #1 Timer de duração usa delta real (tolera throttle de aba)
- ✅ #2 Race condition: persistir/gerar resumo só quando speech volta a "idle" via refs
- ✅ #8 Modelo Claude pinned + cache_control nos prompts
- ✅ #14 generateSummary lê refs (transcriptRef, slidesRef) não closure stale
- ✅ MIME spoofing tratado via magic bytes

## Pendente (não-blocker, pós-launch)

- localStorage → Supabase: lectures/subjects ainda usam localStorage como persistência principal. Migração: criar service que sincroniza ao login (próxima sprint).
- IndexedDB pra slides com imagem (localStorage estoura quota com PDF de 30 slides). Mitigação atual: limite no PDF + warning.
- Sentry pra error tracking
- PostHog pra analytics
- DPR/LGPD: termos de uso + política de privacidade
- Email verification step opcional (magic link já confirma email)

## Comandos

```bash
cd /Users/gilbertoluporini/lumio
npm run dev       # localhost:3001 (3000 em uso)
npm run build     # validação TS + bundle
git status
gh repo view
```

## Setup pra produção

Ver `SETUP.md` — checklist 30-45 min do zero ao deploy.
