# PostHog Dashboards — Lumio

Tudo criado via REST API (`POST /api/projects/438840/...`) em **2026-05-25**.
Project: **438840** (US Cloud). Host admin: `https://us.posthog.com`. Host ingestão: `https://us.i.posthog.com`.

---

## 1. Dashboards

| # | Nome | ID | URL | Tiles |
|---|---|---|---|---|
| 1 | Sprint 1 — Orgânico & Embaixadores | `1628411` | https://us.posthog.com/project/438840/dashboard/1628411 | 6 |
| 2 | Sprint 2 — Paid Ads | `1628412` | https://us.posthog.com/project/438840/dashboard/1628412 | 6 |
| 3 | Acquisition by Channel | `1632907` | https://us.posthog.com/project/438840/dashboard/1632907 | 4 |

Bonus: o PostHog auto-gerou um terceiro dashboard `1628421 — embaixador_program Usage` ao criar a feature flag (não solicitado, ignorável).

### Dashboard 3 — Acquisition by Channel — `1632907`

Criado em **2026-05-26** durante o setup de tracking multi-canal pré-Sprint 2 (Instagram + TikTok + LinkedIn + Twitter + bio links + outbound + ads). Dependências:
- Evento `outbound_social_click` (disparado pelo `src/proxy.ts` em `/ig`, `/tt`, `/li`, `/tw`, `/yt`).
- Evento `sign_up` enriquecido com UTM super properties (via `src/lib/utm-tracker.ts` + `posthog.register`).
- Person property `first_utm_source` (setada via `$set` no server-side `sign_up` no `signup-password`).
- Migration `016_signup_attribution.sql` (tabela `signup_attribution` espelhando o que vai pro PostHog).

| Insight | ID | short_id | Tipo | Notas |
|---|---|---|---|---|
| Signups por utm_source (30d) | `8868708` | `8TFzgYqG` | Trends · Bar Value | Daily 30d, breakdown `utm_source` |
| Funnel: landing_view → signup_view → sign_up → purchase (por source) | `8868710` | `4hAF5TRt` | Funnel · Steps | Breakdown `utm_source`, janela 7d |
| Retention 30d por first_utm_source | `8868711` | `FO8iUh4k` | Retention | Cohort de sign_up, returning $pageview, breakdown person prop `first_utm_source` |
| outbound_social_click por destino | `8868717` | `vkeyX9U6` | Trends · Bar Value | Daily 30d, breakdown `channel` |

Tiles ficam zerados até começarem a chegar UTMs reais (Sprint 2). Pra forçar smoke-test, abrir `https://lumioapp.net/?utm_source=test&utm_medium=manual&utm_campaign=qa` em janela anônima e dar uma volta no site.

---

## 2. Insights por Dashboard

### Dashboard 1 — Sprint 1 (Orgânico & Embaixadores) — `1628411`

| Insight | ID | short_id | Tipo | Notas |
|---|---|---|---|---|
| Total de signups (Big Number, 30d) | `8843168` | `tWSqcs5g` | Trends · BoldNumber | KPI principal Sprint 1 |
| Signups por dia (breakdown utm_source) | `8843148` | `2RhuH3Nv` | Trends · Line | Daily 14d, breakdown `utm_source` |
| Signups via referral (`?ref=` na URL) | `8843165` | `bLz0H3N5` | Trends · Line | Filtra `$current_url icontains "ref="` |
| Top utm_campaign por signups | `8843166` | `Is9OaRXn` | Trends · BarValue | Ranking 30d, breakdown `utm_campaign` |
| Funil: sign_up → log_in → purchase (14d) | `8843164` | `ueWBLRtF` | Funnel · Steps | Substitui "signup→ativação→pagante" porque ainda não há evento de "primeira aula gravada". Trocar quando `lecture_created` existir. |
| Retention D1/D7/D30 (signup → log_in) | `8843167` | `W6Eb5lKy` | Retention | Cohort de sign_up retornando via log_in |

### Dashboard 2 — Sprint 2 (Paid Ads) — `1628412`

| Insight | ID | short_id | Tipo | Notas |
|---|---|---|---|---|
| Signups por utm_source (paid channels) | `8843169` | `k7Sj0sAM` | Trends · Line | Daily 30d, breakdown `utm_source` |
| Conversão landing → signup por utm_source | `8843172` | `ptlsXyEy` | Funnel · Steps | Breakdown `utm_source`, janela 7d |
| Funil paid: pageview (cpc/paid/social) → sign_up → purchase | `8843170` | `m2CbBrCD` | Funnel · Steps | Filtro `utm_medium in [cpc, paid, paid_social, social, reels]` |
| Revenue por utm_source (sum amount_brl) | `8843171` | `RPiWaqW9` | Trends · BarValue | `sum(purchase.amount_brl)`, vazio até primeiro purchase |
| Tempo médio sign_up → purchase | `8843173` | `VvkWwoWZ` | Funnel · time_to_convert | Janela 30d |
| CAC por canal (preenchimento manual) | `8843174` | `IVfAtRfL` | Trends · Table | Tabela de signups/source. PostHog não tem ad spend — usar planilha externa e dividir `spend / signups` por canal. |

URL de qualquer insight: `https://us.posthog.com/project/438840/insights/{short_id}`.

---

## 3. Cohorts

| Cohort | ID | Count atual | Definição |
|---|---|---|---|
| Power users /lumi (>=3 visitas em 7d) | `327961` | aguardando cálculo (async) | `$pageview` com `$pathname icontains "/lumi"` >= 3 vezes nos últimos 7d. Proxy até termos `lumi_chat_message` instrumentado. |
| At-risk churners (pagantes sem log_in há 7d) | `327962` | `0` | Person prop `plan` is_set **AND** não disparou `log_in` nos últimos 7d (behavioral negation) |
| Embaixadores ativos (referral_code setado) | `327963` | `0` | Person prop `referral_code` is_set |
| Trial expired (signup 14-30d sem purchase) | `327964` | `0` | sign_up 14-30d atrás **AND** nunca disparou `purchase` |

URL: `https://us.posthog.com/project/438840/cohorts/{id}`.

Counts em zero esperados — produto recém-instrumentado, sem volume de `sign_up`/`purchase` real ainda. PostHog recalcula cohorts periodicamente; o "Power users /lumi" pode levar alguns minutos pra primeiro cálculo (behavioral_event_multiple_times é heavy).

---

## 4. Feature Flag

| Campo | Valor |
|---|---|
| ID | `689868` |
| Key | `embaixador_program` |
| Active | `true` |
| Rollout | **100%** (todos os users) |
| URL | https://us.posthog.com/project/438840/feature_flags/689868 |
| Default (server-side `getFeatureFlag` retorna) | `true` quando rollout 100% sem filtros de pessoa |

Uso pretendido: gate da rota `/account/embaixador`. Pra rollback rápido, basta PATCH `active: false` ou rollout 0 via API:

```bash
curl -X PATCH "https://us.posthog.com/api/projects/438840/feature_flags/689868/" \
  -H "Authorization: Bearer $POSTHOG_PERSONAL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"filters":{"groups":[{"properties":[],"rollout_percentage":0}]}}'
```

---

## 5. Annotation

| Campo | Valor |
|---|---|
| ID | `336026` |
| Date marker | `2026-05-25T22:13:52Z` |
| Scope | `project` (aparece em todos dashboards) |
| Content | "Sprint 1 kickoff — dashboards criados via API (2 dashboards, 12 insights, 4 cohorts, 1 feature flag)." |

---

## 6. Eventos: esperado vs real

### Confirmados em ingestão (via `GET /event_definitions/`)

- `$pageview` (último: 2026-05-25 22:05)
- `$autocapture`
- `$pageleave`
- `$identify`
- `$set`
- `$rageclick`
- `log_in` (último: 2026-05-25 21:34) — **único evento custom já disparado em produção**

### Esperados pelo briefing mas SEM disparo ainda

Todos definidos em `src/lib/analytics.ts` (helper `Analytics`) mas zero hits na ingestão:

| Evento esperado | Helper que dispara | Status |
|---|---|---|
| `sign_up` | `Analytics.signUp(method)` | Não disparou ainda — provavelmente helper não está sendo chamado no callback do auth. Verificar `/login`, `/signup`. |
| `begin_checkout` | `Analytics.beginCheckout(plan, value)` | Não disparou — checar `/pricing` botão de plano. |
| `purchase` | `Analytics.purchase(...)` | Não disparou — webhook Stripe é server-side, **provavelmente não tem PostHog server-side instalado**. Hoje só captura no browser (`window.posthog`). **Bloqueador pra revenue tracking.** |
| `generate_lead` | `Analytics.generateLead(source)` | Não disparou — esperado em form waitlist/embaixador. |
| `asset_generated` | `Analytics.assetGenerated(kind, withImages)` | Não disparou — não chamado nos endpoints de IA. |
| `view_item` | `Analytics.viewItem(item)` | Não disparou. |
| `page_view` (custom, além do automático `$pageview`) | `Analytics.pageView(path)` | Não disparou — usar só `$pageview` que vem automático. |

Eventos do briefing que **nem estão no código** (esperados pela tarefa mas não implementados):

- `attachment_uploaded`
- `lumi_chat_message`
- `lecture_created`
- `summary_generated`
- `referral_click`

---

## 7. Próximos passos sugeridos

### Urgente (desbloqueia dashboards)

1. **Instrumentar `sign_up` no callback do Supabase Auth.** Hoje `Analytics.signUp()` não é chamado em lugar nenhum visível — `grep -rn "Analytics.signUp\|trackSignup" src/` retorna vazio. Sem isso, 90% dos tiles ficam zerados.
2. **PostHog server-side no webhook Stripe.** O `purchase` precisa rodar com `posthog-node` no handler `/api/stripe/webhook` chamando `client.capture({ distinctId, event: 'purchase', properties: { plan, amount_brl, currency } })`. Sem isso, Revenue/CAC/funil paid → purchase ficam impossíveis.
3. **`identify` no login com `referral_code` setado.** Pra cohort "Embaixadores ativos" funcionar, no momento do signup com `?ref=ABC123`, fazer `posthog.identify(userId, { referral_code: 'ABC123' })`. Persistir também na coluna `profiles.referral_code`.

### Eventos custom faltando pra instrumentar

| Evento | Onde disparar | Cohort/insight que destrava |
|---|---|---|
| `lecture_created` | Após upload+transcrição completar com sucesso | Funil ativação real (substitui o `log_in` do tile atual) |
| `lumi_chat_message` | Em `/lumi` ao submeter cada turno | Cohort "Power users /lumi" passa a usar isso direto |
| `referral_click` (page-level) | Em `useEffect` na landing quando `?ref=XYZ` está na URL | Tile "Signups via referral" fica mais preciso (hoje usa `$current_url icontains "ref="`) |
| `attachment_uploaded` | Em handler de upload (`/api/upload`) | Engajamento por feature |
| `summary_generated` | Em handler de IA | KPI de uso da IA |

### Cohorts pra criar depois (quando houver evento)

- **"Ativados D1"** — sign_up + lecture_created no mesmo dia
- **"PMF cohort"** — sign_up + >=5 lumi_chat_message + retornou em D7
- **"Embaixadores top performers"** — referral_code setado AND signups atribuídos > 5
- **"Refunds"** — purchase + Stripe webhook charge.refunded (server-side)

### Operacional

- Configurar **alertas** (PostHog Alerts) em queda > 30% de `sign_up` daily vs média 7d.
- Compartilhar dashboards públicos (token-protected) com co-founders via `POST /dashboards/{id}/sharing/`.
- Adicionar `subscriptions` (email semanal do dashboard) — útil pra alinhamento sem precisar abrir.

---

## 8. Como reproduzir / atualizar

Todos os payloads JSON estão em `/tmp/ph_payloads/`. Pra qualquer recriação:

```bash
export TOKEN="$POSTHOG_PERSONAL_API_KEY"
export PH_API="https://us.posthog.com/api/projects/438840"
curl -X POST "$PH_API/insights/" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d @/tmp/ph_payloads/i1_signups_by_day.json
```

**Importante:** PostHog não aceita mais o formato legacy `filters` via API — só o novo `query` (InsightVizNode + TrendsQuery/FunnelsQuery/RetentionQuery). Tentativa inicial retornou:

> 403: "Creating or updating insights with legacy filters is not available for this user."

Resolvido migrando todos os payloads para `query.kind = "InsightVizNode"`.

---

**Última atualização:** 2026-05-25
**Autor:** Analytics Reporter (via API)
**Credenciais usadas:** `POSTHOG_PERSONAL_API_KEY` (lida de `/Users/gilbertoluporini/lumio/.env.local`)
