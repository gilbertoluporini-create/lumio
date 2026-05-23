# Lumio — Setup pra produção

Guia passo a passo pra colocar o Lumio no ar pronto pra vender. Tempo estimado: **30–45 min**.

---

## 1. Contas a criar (15 min)

| Serviço | URL | Pra que serve |
|---|---|---|
| **Supabase** | https://supabase.com | Auth (magic link) + Postgres + storage |
| **Stripe** | https://stripe.com | Pagamentos (cartão + PIX BR) + assinaturas |
| **Resend** | https://resend.com | Emails transacionais |
| **Anthropic** | https://console.anthropic.com | IA do chat + correlação |
| **Vercel** | https://vercel.com | Deploy + env vars |
| **GitHub** | https://github.com | Repositório (já criado: `gilbertoluporini-create/lumio`) |

Todas têm free tier suficiente pra começar.

---

## 2. Configurar Supabase (10 min)

1. Criar novo projeto. Escolha região `South America (São Paulo)`.
2. Ir em **SQL Editor** → cole o conteúdo de `supabase/schema.sql` → **Run**. Cria tabelas + RLS + triggers.
3. **Settings → API**:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` → `SUPABASE_SERVICE_ROLE_KEY` (NUNCA expor no client)
4. **Authentication → Providers**: habilite Email (Magic Link já vem ativo).
5. **Authentication → Email Templates → Magic Link**: edite pra português:
   - Subject: `Seu link de acesso ao Lumio ✨`
   - Body: substitua `{{ .ConfirmationURL }}` no link.
6. **Authentication → URL Configuration**:
   - Site URL: `https://SEU-DOMINIO` (ou `http://localhost:3000` em dev)
   - Redirect URLs: adicione `https://SEU-DOMINIO/auth/callback`
7. **Authentication → Settings**:
   - OTP Expiry: `600` (10 minutos)
8. Após primeiro login com seu email, promova-se a admin no SQL Editor:
   ```sql
   update profiles set role = 'admin' where email = 'gilbertoluporini@gmail.com';
   ```

---

## 3. Configurar Stripe (10 min)

1. Modo Test primeiro. Depois repete em Live.
2. **Products** → criar 2 produtos:
   - **Lumio Pro** — preço recorrente mensal, **R$ 19,00 BRL**
   - **Lumio Anual** — preço recorrente anual, **R$ 149,00 BRL**
3. Copie os Price IDs (`price_xxx`) pra `STRIPE_PRICE_ID_PRO` e `STRIPE_PRICE_ID_ANNUAL`.
4. **Developers → API keys**:
   - Secret key → `STRIPE_SECRET_KEY` (test ou live)
   - Publishable → `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
5. **Developers → Webhooks** → Add endpoint:
   - URL: `https://SEU-DOMINIO/api/stripe/webhook`
   - Events:
     - `checkout.session.completed`
     - `checkout.session.async_payment_succeeded`
     - `customer.subscription.created`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
     - `invoice.paid`
   - Após criar, copie o **Signing secret** (`whsec_...`) pra `STRIPE_WEBHOOK_SECRET`.
6. Em dev local, use Stripe CLI:
   ```bash
   stripe listen --forward-to localhost:3000/api/stripe/webhook
   ```
   Use o `whsec_...` que o CLI imprime.
7. Ativar **PIX** em **Settings → Payment methods** (Brasil).
8. **Customer Portal** (pro user gerenciar/cancelar assinatura):
   - **Settings → Billing → Customer portal** → ativar.
   - Permitir: cancelamento, atualizar forma de pagamento, ver histórico.
   - Salvar — o `/api/portal` do app vai criar sessões automaticamente.

---

## 4. Configurar Resend (3 min)

1. Criar conta. **Settings → API Keys** → criar nova key → `RESEND_API_KEY`.
2. Em dev, use `onboarding@resend.dev` como remetente (não precisa verificar domínio).
3. Em prod: verifique seu domínio (DNS) e use `hello@SEUDOMINIO`.

---

## 5. .env.local (2 min)

Copie `.env.example` pra `.env.local` e preencha. Verifique especialmente:

- `NEXT_PUBLIC_APP_URL` — em dev é `http://localhost:3000`; em prod é seu domínio HTTPS.
- `ADMIN_EMAILS` — seu email (gilbertoluporini@gmail.com já configurado).

---

## 6. Rodar local (1 min)

```bash
npm install
npm run dev
```

Abra http://localhost:3000.

### Smoke test (5 min)

1. Landing carrega — anima, magnetic CTAs, lenis smooth scroll
2. `/pricing` mostra 3 tiers + FAQ
3. Click em "Assinar Pro" → se não logado, redireciona pra `/login`
4. Login com seu email → recebe magic link no inbox → clica → entra
5. Vai pra `/onboarding` → cria matérias
6. Cria uma aula → grava 30s falando → para → resumo gera automático
7. Acessa `/admin` — vê suas próprias métricas

---

## 7. Deploy Vercel (5 min)

1. `vercel link` pelo CLI ou conectar repo `gilbertoluporini-create/lumio` no dashboard.
2. **Settings → Environment Variables**: cole TODAS as do `.env.local` (sem o ADMIN_EMAILS expor no public bundle — só `NEXT_PUBLIC_*` são expostas).
3. Marque `SUPABASE_SERVICE_ROLE_KEY` e `STRIPE_*` como **Sensitive**.
4. Deploy.
5. Atualize Stripe webhook URL pra `https://SEU-DOMAIN.vercel.app/api/stripe/webhook`.
6. Atualize Supabase Redirect URL pra `https://SEU-DOMAIN.vercel.app/auth/callback`.

---

## 8. Sanity tests pré-launch

- [ ] `GET /api/health` retorna `{integrations:{anthropic,supabase,stripe,resend}}` todos `true`
- [ ] Webhook Stripe entrega com signature OK (use Stripe CLI ou dashboard test)
- [ ] `/admin` redireciona pra `/dashboard` quando não-admin
- [ ] Tentativa de hit em `/api/chat` sem login retorna 401
- [ ] Tentativa de `/api/correlate` sem subscription ativa retorna 402 com `upgrade: "/pricing"`
- [ ] Upload de PDF >20MB retorna 413
- [ ] Upload de arquivo com extensão .pdf mas conteúdo não-pdf retorna 415 (magic byte sniff)
- [ ] Rate limit dispara após 30 reqs/min na mesma rota
- [ ] CSP headers presentes (DevTools → Network → headers)
- [ ] `/account/billing` mostra plano atual + botão "Gerenciar no portal Stripe"

---

## 9. Próximos passos pós-launch

- [ ] Domínio próprio (Cloudflare + DNS pra Vercel)
- [ ] Logo PNG pra OG image (1200x630)
- [ ] Sentry pra error tracking (free 5k events/mês)
- [ ] PostHog/Plausible pra analytics (privacidade-friendly)
- [ ] Termo de uso + política de privacidade (templates em https://www.iubenda.com)
- [ ] Suporte: hello@SEUDOMINIO redireciona pra você
- [ ] Migrar dados localStorage → Supabase (script de migração quando user fizer primeiro login)
