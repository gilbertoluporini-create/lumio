# LGPD — Tracking Notes (pendências)

> **Status:** Escopo MVP do tracking foi implementado **sem** cookie banner / consent gate. Aceitável durante alpha/beta com base legal "legítimo interesse" + Privacy Policy clara, mas precisa ser fechado **antes de escalar Sprint 2 com ads pagos**.

Última revisão: **2026-05-26**

---

## 1. O que está sendo coletado HOJE

Pelo `src/components/analytics/analytics-scripts.tsx` (em produção):

- **Google Analytics 4** (`G-GH4YVVYRR0`) — `$pageview`, eventos custom (`sign_up`, `purchase`, `begin_checkout`, etc), IP anonimizado (`anonymize_ip: true`).
- **Meta Pixel** (`867791183024108`) — `PageView`, `CompleteRegistration`, `Purchase`. Sem advanced matching automático (email só vai server-side via CAPI).
- **PostHog** (`phc_w5YjRDXR…`) — `$pageview`, `$autocapture` (clicks!), `$rageclick`, `$identify`, custom events com UTM como super properties + `localStorage.lumio.attribution`.
- **localStorage `lumio.attribution`** — UTM completo + click IDs (`gclid`, `fbclid`, `ttclid`) + timestamps, TTL 90 dias. Setado pelo `src/lib/utm-tracker.ts`.
- **Cookie `lumio_outbound`** — channel + timestamp do último `/ig`, `/tt`, etc. 30 dias, não-httpOnly (queremos ler client-side).
- **Cookie `lumio_ref`** — código de embaixador (`LUMI-XXXX`). 60 dias, httpOnly. Setado pelo proxy.

Server-side (`src/lib/server-analytics.ts`):

- **Meta CAPI** — `Purchase`, `CompleteRegistration` com email + IP + UA hasheados (SHA-256).
- **GA4 Measurement Protocol** — eventos espelho do CAPI.
- **PostHog `/capture`** — `sign_up` server-side (com email e UTM) + `outbound_social_click`.

Tabela `signup_attribution` (Supabase) — JSONB com a foto completa do attribution no momento do signup.

---

## 2. O que falta pra ficar LGPD-compliant

### 2.1. Cookie banner (CMP) com opt-in granular

Antes de qualquer script de tracking carregar, o user precisa **consentir explicitamente** com cookies não-essenciais. Categorias mínimas:

| Categoria | Necessário consent? | Scripts impactados |
|---|---|---|
| Essenciais (auth, csrf) | Não | Supabase, `lumio_ref` |
| Analytics | **Sim** | PostHog, GA4 |
| Marketing | **Sim** | Meta Pixel + CAPI, gclid/fbclid/ttclid |
| Funcional (preferences) | Sim (mas leve) | localStorage `lumio.attribution`, theme |

**Tooling sugerido:** [Cookiebot](https://cookiebot.com), [Klaro](https://github.com/klaro-org/klaro-js) (open-source), ou rolar próprio. Klaro tem boa integração com Next.js sem ser pesado.

### 2.2. Window flag global `__lumioConsent`

Refatorar `src/lib/analytics.ts` e `src/lib/utm-tracker.ts` pra checar uma flag antes de disparar:

```ts
function canTrack(category: "analytics" | "marketing"): boolean {
  if (typeof window === "undefined") return false;
  const consent = window.__lumioConsent;
  return consent?.[category] === true;
}

// Em todo trackEvent / posthog.capture:
if (!canTrack("analytics")) return;
```

E o CMP popula `window.__lumioConsent = { analytics: true, marketing: false }` após o user clicar "Aceitar selecionados".

**Pra GA4:** já existe Google Consent Mode v2 — pode setar `gtag('consent', 'default', { ad_storage: 'denied', analytics_storage: 'denied' })` antes do init e depois `'update'` quando o user aceita. Permite manter Conversion Modeling mesmo com consent rejeitado.

**Pra Meta:** o Meta SDK tem `fbq('consent', 'revoke')` / `fbq('consent', 'grant')` — usar o mesmo padrão.

**Pra PostHog:** `posthog.opt_in_capturing()` / `posthog.opt_out_capturing()`. Já tem suporte first-class.

### 2.3. Retention policy

| Dado | Local | Retention atual | Retention recomendada |
|---|---|---|---|
| Eventos PostHog | PostHog Cloud (US) | 7 anos (default) | 14 meses (ajustar no Project Settings → Data Management) |
| GA4 events | Google | 14 meses (default no GA4) | OK como está |
| Meta Pixel/CAPI | Meta | indef (não controlável) | aceito risco |
| `signup_attribution` (Supabase) | Próprio DB | indefinido | criar `delete from signup_attribution where created_at < now() - interval '2 years'` em cron mensal |
| `lumio.attribution` (localStorage) | client | 90d (TTL implementado) | OK |
| `lumio_outbound` (cookie) | client | 30d | OK |

### 2.4. Direitos do titular (Art. 18 LGPD)

Precisa endpoint/fluxo pra:
- **Acesso**: user baixar todos os dados que temos sobre ele (signup_attribution + subscriptions + lumi_chats + …).
- **Eliminação**: deletar conta → cascade nas tabelas com FK (já configurado via `on delete cascade` em quase tudo). Falta endpoint POST `/api/account/delete` que executa.
- **Portabilidade**: export JSON dos chats/resumos do user.

Hoje existe `/api/account/*` parcial — auditar gaps.

### 2.5. Privacy Policy + Termos

`/privacy` e `/terms` existem (`src/app/privacy/`, `src/app/terms/`). Precisa revisão pra:
- Listar TODOS os trackers (GA4, Meta, PostHog) com finalidade.
- Listar todos os cookies (com tabela).
- Linkar com a CMP ("você pode alterar suas preferências aqui").
- Citar base legal (consentimento p/ marketing, legítimo interesse p/ analytics agregado).
- DPO contact (gilbertoluporini@gmail.com hoje? definir).

---

## 3. Riscos atuais (sem CMP)

| Risco | Severidade | Mitigação parcial atual |
|---|---|---|
| Fine ANPD (até 2% do faturamento, max R$ 50M) | Alta em prod com ads | Faturamento ainda baixo + nicho B2C estudante (não-sensível) |
| Browser blocks (Safari ITP, Firefox ETP) | Média | Já mitigado com server-side CAPI + GA4 MP |
| Adblockers bloqueando GA4/Pixel | Média | Mitigado com PostHog + server-side |
| User reportando ANPD | Baixa-Média | Privacy Policy existe; falta CMP |
| Meta/Google suspendendo conta de ads por falta de CMP | Média | Google e Meta exigem CMP pra serviçar ads na EU; Brasil é mais leniente mas começou a apertar em 2025 |

---

## 4. Action items (futuro)

1. [ ] **Instalar Klaro** (ou similar). Sprint 3.
2. [ ] **Refactor analytics.ts e utm-tracker.ts** pra consultar `__lumioConsent`. Sprint 3.
3. [ ] **Setar Consent Mode v2 default-denied** no `analytics-scripts.tsx` + chamar `'update'` quando user aceita.
4. [ ] **Reduzir retention PostHog** pra 14 meses. (5 min via UI.)
5. [ ] **Endpoint `/api/account/delete-data`** com confirmação por email.
6. [ ] **Endpoint `/api/account/export-data`** retornando ZIP/JSON.
7. [ ] **Revisar /privacy e /terms** com advogado especializado em LGPD (Drumeo, Tozzini Freire, etc).
8. [ ] **Cron mensal** pra purgar `signup_attribution` > 2 anos.

---

## 5. Decisão / Sign-off

Mantendo tracking ativo SEM CMP durante **alpha + Sprint 2 lançamento** (até ~2026-08), apostando em:
- Volume baixo (poucos users) reduz risco.
- Base legal "legítimo interesse" pra analytics agregado é defensável.
- Privacy Policy publicada em `/privacy`.

**Hard stop** pra implementar CMP: quando ultrapassar **5k usuários ativos/mês** OU quando começar **ads na EU** (qualquer um primeiro).
