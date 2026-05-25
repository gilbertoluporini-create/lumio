# Domain Verification — Meta + Resend (passo-a-passo)

> Sem isso, **Meta AEM filtra eventos iOS** e **Resend só envia pra sua própria conta**. Bloqueia 60% dos resultados de paid ads + 90% dos emails de produção.

## 1. Meta Business Manager — verificar `lumioapp.net`

Esse domain verification é OBRIGATÓRIO pra AEM (Aggregated Event Measurement) funcionar no iOS 17+. Sem isso, conversões do iPhone são amostradas/filtradas e o algoritmo de otimização do Meta fica cego.

### Passos (10 minutos)

1. **business.facebook.com** → Configurações da empresa (gear icon canto inferior esquerdo)
2. **Brand Safety** → **Domínios**
3. **Adicionar** → digite `lumioapp.net` → Adicionar
4. Vai abrir 3 opções de verificação. **Escolha "Meta tag"** (mais rápida, não precisa mexer no DNS)
5. Copie a meta tag que aparece (formato: `<meta name="facebook-domain-verification" content="XXXXXXXX">`)
6. **Cole no chat aqui** — eu adiciono no `src/app/layout.tsx` em <5 segundos
7. Deploy automático na Vercel
8. Volta no Business Manager → clica "Verificar"

### Alternativa DNS (mais permanente)
Se preferir DNS TXT:
1. Hostinger DNS → `lumioapp.net` → Adicionar record
2. Type: `TXT`, Name: `@`, Value: `facebook-domain-verification=XXXXXXXX`
3. Salvar (propaga em ~10min, mas pode demorar até 24h)

## 2. Configurar AEM (Aggregated Event Measurement)

Pré-requisito: domain verified (passo 1). Depois:

1. Events Manager → Pixel **Lumio** (867791183024108)
2. Aba **Aggregated Event Measurement** (ou "Conversões agregadas" em pt)
3. Adicionar `lumioapp.net` → Manage Events
4. Priorizar nesta ordem (arrastar/numerar):

| # | Evento | Razão |
|---|--------|-------|
| 1 | `Purchase` | Maior valor — otimização primária |
| 2 | `Subscribe` | Trigger no Stripe checkout completed |
| 3 | `CompleteRegistration` | Sign-up (sign_up event mapeia pra cá) |
| 4 | `InitiateCheckout` | Begin checkout |
| 5 | `Lead` | Magic link, embaixador form |
| 6 | `Login` | Returning users — retargeting |
| 7 | `ViewContent` | Visualização granular |
| 8 | `PageView` | Catch-all |

5. Salvar — propaga em ~24h (Meta refresha 1×/dia)

## 3. Resend — verificar domain pra emails de produção

Sem isso, todo email do Lumio (welcome, recibo, onboarding sequence) **falha silenciosamente** pra qualquer endereço que não seja `gilbertoluporini@gmail.com`.

### Passos (5min ato + 15-30min propagação DNS)

1. **resend.com/domains** → Add Domain
2. Digite `lumioapp.net` (ou subdomain como `mail.lumioapp.net` se preferir isolar)
3. Resend mostra ~6 records DNS pra adicionar: 3× MX, 2× TXT (SPF + DKIM), 1× DMARC
4. **Hostinger DNS** (`hpanel.hostinger.com/domains/lumioapp.net/dns`) → Adicionar cada record:
   - `SPF` (TXT @): valor que o Resend mostra (inclui `include:_spf.resend.com`)
   - `DKIM` (TXT `resend._domainkey`): valor longo do Resend
   - `MX` (MX @): `feedback-smtp.us-east-1.amazonses.com` priority 10
   - `DMARC` (TXT `_dmarc`): `v=DMARC1; p=none;` (mínimo)
5. Volta no Resend → "Verify" → fica green em 5-30min
6. Atualizar Vercel env:
   ```
   RESEND_FROM_EMAIL=Lumio <hello@lumioapp.net>
   ```
7. Redeploy

### Validação
Depois de verificado:
```bash
curl -X POST https://api.resend.com/emails \
  -H "Authorization: Bearer $RESEND_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"from":"Lumio <hello@lumioapp.net>","to":["VOCE+test@gmail.com"],"subject":"Teste","html":"<p>OK</p>"}'
```

Deve retornar `{"id":"..."}` sem erro. Verifica caixa de entrada.

## 4. Ativar Onboarding Email Sequence

**Pré-requisitos** (na ordem):

- [ ] Resend domain verified (item 3)
- [ ] `RESEND_FROM_EMAIL` atualizado pra `Lumio <hello@lumioapp.net>` na Vercel
- [ ] Tabela `email_send_log` criada via Supabase SQL editor:

```sql
create table if not exists email_send_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email_kind text not null,
  sent_at timestamptz not null default now(),
  unique (user_id, email_kind)
);
create index email_send_log_user_kind_idx on email_send_log (user_id, email_kind);
```

- [ ] Adicionar cron entry em `vercel.json`:

```json
{
  "crons": [
    { "path": "/api/cron/health-check", "schedule": "0 8 * * *" },
    { "path": "/api/cron/email-onboarding", "schedule": "0 13 * * *" }
  ]
}
```

(13h UTC = 10h BRT — emails saem de manhã pro lado bom da curva de open rate.)

- [ ] Deploy
- [ ] Smoke test manual primeiro:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  https://www.lumioapp.net/api/cron/email-onboarding
```

Deve retornar stats `{ eligible, sent, skipped, errors }` por step.

## 5. Checklist final pra começar a vender

- [ ] **Meta domain verified** + AEM priorizado (passos 1+2)
- [ ] **Resend domain verified** + FROM atualizado (passo 3)
- [ ] **Email sequence ativado** (passo 4)
- [ ] **3 vídeos** prontos (ver `CRIATIVOS_SPRINT.md`)
- [ ] **Conversão `Purchase` testada** end-to-end via Stripe + ver evento no Events Manager
- [ ] **Budget Vercel**: deixar alerta de cost cap configurado

Tudo isso feito → **dia 1 da sprint**: subir 3 campanhas (Meta R$30, TikTok R$12.50, Google R$10 por dia).

---
*Versão 1 · 2026-05-25*
