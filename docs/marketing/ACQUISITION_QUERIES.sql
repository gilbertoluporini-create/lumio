-- ============================================================================
-- ACQUISITION_QUERIES.sql — Análise de aquisição multi-canal do Lumio
-- ============================================================================
-- Rode no SQL Editor do Supabase. Todas usam `signup_attribution` (migration
-- 016) + `subscriptions` (schema base) + `referral_redemptions` (007).
--
-- IMPORTANTE: Como a coluna `signup_attribution.created_at` = momento do
-- signup, ela funciona como source-of-truth temporal (não depende de quando
-- a row do profile foi tocada).
--
-- Convenções:
--   - Janelas: 7d/30d/90d. Sempre `now() - interval '<N> days'`.
--   - "Paying user" = subscription com status active OR trialing E plan != 'free'.
--   - LTV preliminar: usamos `current_period_end - created_at` * preço do plano.
--     Quando tivermos histórico real de invoices, trocar pro `sum(amount_brl)`.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. SIGNUPS POR UTM_SOURCE (last 7d / 30d / 90d)
-- ----------------------------------------------------------------------------
-- Pra ranking de "qual canal manda mais gente" (sem qualificar ainda).
-- coalesce('direct') agrupa todo signup sem UTM como "direct".

select
  coalesce(utm_source, 'direct') as source,
  count(*) filter (where created_at >= now() - interval '7 days')  as signups_7d,
  count(*) filter (where created_at >= now() - interval '30 days') as signups_30d,
  count(*) filter (where created_at >= now() - interval '90 days') as signups_90d
from public.signup_attribution
group by 1
order by signups_30d desc nulls last;


-- ----------------------------------------------------------------------------
-- 1b. SIGNUPS POR FIRST_UTM_SOURCE (first-touch attribution)
-- ----------------------------------------------------------------------------
-- Útil pra ver canais de aquisição "verdadeiros". Last-touch sofre viés —
-- ex: user vê Insta, depois pesquisa "lumio" no Google e cai direto → last
-- diz "google/organic" mas o crédito real é IG.

select
  coalesce(first_utm_source, 'direct') as first_source,
  count(*) filter (where created_at >= now() - interval '30 days') as signups_30d,
  count(*) as signups_total
from public.signup_attribution
group by 1
order by signups_30d desc nulls last;


-- ----------------------------------------------------------------------------
-- 2. SIGNUPS → PAGANTES POR SOURCE
-- ----------------------------------------------------------------------------
-- Junta signup_attribution com subscriptions. "Pagante" = qualquer linha
-- em subscriptions com plan diferente de 'free' E status ativo histórico
-- (active OR trialing OR past_due OR canceled — porque já pagou pelo menos 1x).

with paid_users as (
  select distinct user_id
  from public.subscriptions
  where plan <> 'free'
    and status in ('active', 'trialing', 'past_due', 'canceled')
)
select
  coalesce(sa.utm_source, 'direct') as source,
  count(distinct sa.user_id) as signups,
  count(distinct pu.user_id) as paying_users,
  round(
    100.0 * count(distinct pu.user_id)
    / nullif(count(distinct sa.user_id), 0),
    2
  ) as conversion_rate_pct
from public.signup_attribution sa
left join paid_users pu on pu.user_id = sa.user_id
where sa.created_at >= now() - interval '90 days'
group by 1
order by paying_users desc nulls last;


-- ----------------------------------------------------------------------------
-- 3. CONVERSION RATE POR SOURCE (apenas signups que tiveram tempo de converter)
-- ----------------------------------------------------------------------------
-- Excluí signups < 7d (ainda têm chance de pagar). Compara cohort "maduro".

with mature_signups as (
  select user_id, utm_source, created_at
  from public.signup_attribution
  where created_at < now() - interval '7 days'
    and created_at >= now() - interval '90 days'
),
paid_users as (
  select user_id, min(created_at) as first_paid_at
  from public.subscriptions
  where plan <> 'free' and status in ('active', 'trialing')
  group by 1
)
select
  coalesce(ms.utm_source, 'direct') as source,
  count(*) as mature_signups,
  count(pu.user_id) as paid,
  round(100.0 * count(pu.user_id) / nullif(count(*), 0), 2) as cvr_pct
from mature_signups ms
left join paid_users pu on pu.user_id = ms.user_id
group by 1
having count(*) >= 5  -- esconde fontes com sample muito pequeno
order by cvr_pct desc nulls last;


-- ----------------------------------------------------------------------------
-- 4. LTV PRELIMINAR POR SOURCE
-- ----------------------------------------------------------------------------
-- LTV proxy = soma do valor do plano por meses ativos. Sem invoices reais
-- ainda, assumimos preços fixos:
--   pro mensal     → R$ 39 / mês
--   annual (anual) → R$ 348 / ano (= R$ 29/mês equivalente)
--   free           → R$ 0
--
-- Quando integrar com tabela de invoices/payments reais, trocar por SUM
-- direto. Por enquanto isso dá ordem de grandeza decente.

with plan_prices as (
  select 'pro'::text    as plan, 39.00::numeric  as monthly_brl
  union all select 'annual', 29.00
  union all select 'free',  0.00
),
user_revenue as (
  select
    s.user_id,
    coalesce(
      extract(epoch from (coalesce(s.current_period_end, now()) - s.created_at))
      / (60 * 60 * 24 * 30),
      0
    ) * pp.monthly_brl as estimated_ltv_brl
  from public.subscriptions s
  join plan_prices pp on pp.plan = s.plan
  where s.plan <> 'free'
)
select
  coalesce(sa.utm_source, 'direct') as source,
  count(distinct sa.user_id) as signups,
  count(distinct ur.user_id) as payers,
  round(coalesce(sum(ur.estimated_ltv_brl), 0)::numeric, 2) as total_estimated_ltv_brl,
  round(
    coalesce(sum(ur.estimated_ltv_brl), 0)::numeric
    / nullif(count(distinct sa.user_id), 0),
    2
  ) as ltv_per_signup_brl
from public.signup_attribution sa
left join user_revenue ur on ur.user_id = sa.user_id
where sa.created_at >= now() - interval '90 days'
group by 1
order by total_estimated_ltv_brl desc nulls last;


-- ----------------------------------------------------------------------------
-- 5. TEMPO MÉDIO ENTRE SIGNUP E PRIMEIRO PAGAMENTO POR SOURCE
-- ----------------------------------------------------------------------------
-- Indicador de "ciclo de venda" do canal. Canais com baixo time-to-paid
-- (ex: Google Ads em high-intent keywords) merecem mais budget.

with first_payment as (
  select user_id, min(created_at) as paid_at
  from public.subscriptions
  where plan <> 'free' and status in ('active', 'trialing', 'past_due')
  group by 1
)
select
  coalesce(sa.utm_source, 'direct') as source,
  count(fp.user_id) as paying_users,
  round(
    avg(extract(epoch from (fp.paid_at - sa.created_at)) / 86400)::numeric,
    2
  ) as avg_days_to_paid,
  round(
    (percentile_cont(0.5) within group (
      order by extract(epoch from (fp.paid_at - sa.created_at)) / 86400
    ))::numeric,
    2
  ) as median_days_to_paid
from public.signup_attribution sa
join first_payment fp on fp.user_id = sa.user_id
where sa.created_at >= now() - interval '90 days'
group by 1
having count(fp.user_id) >= 3  -- só fontes com ≥3 conversões pra média ter sentido
order by avg_days_to_paid asc;


-- ----------------------------------------------------------------------------
-- 6. PAID TRAFFIC (gclid/fbclid/ttclid presentes) vs ORGANIC
-- ----------------------------------------------------------------------------
-- Conversão de signups que vieram com click ID de ad — separa paid de organic
-- mesmo quando UTM tá quebrado/ausente (acontece com sharing manual).

select
  case
    when gclid is not null then 'google_ads'
    when fbclid is not null then 'meta_ads'
    when ttclid is not null then 'tiktok_ads'
    else 'organic_or_direct'
  end as traffic_type,
  count(*) as signups_30d
from public.signup_attribution
where created_at >= now() - interval '30 days'
group by 1
order by signups_30d desc;


-- ----------------------------------------------------------------------------
-- 7. CHANNEL (do /links) — qual rede social do linktree mais converte
-- ----------------------------------------------------------------------------
-- Específico pro page /links. Mostra qual bio (IG / TikTok / etc) traz mais
-- gente que efetivamente paga.

with paid_users as (
  select distinct user_id
  from public.subscriptions
  where plan <> 'free'
)
select
  coalesce(sa.channel, '(no_channel)') as channel,
  count(distinct sa.user_id) as signups,
  count(distinct pu.user_id) as payers,
  round(100.0 * count(distinct pu.user_id) / nullif(count(distinct sa.user_id), 0), 2) as cvr_pct
from public.signup_attribution sa
left join paid_users pu on pu.user_id = sa.user_id
where sa.created_at >= now() - interval '90 days'
group by 1
order by signups desc;


-- ----------------------------------------------------------------------------
-- 8. CROSS-CHECK: REFERRAL PROGRAM vs UTM ATTRIBUTION
-- ----------------------------------------------------------------------------
-- Detecta inconsistência: user veio via referral (cookie lumio_ref) mas tem
-- também utm_source preenchido. Útil pra confirmar que o tracking não tá
-- "roubando" crédito de embaixador.

select
  coalesce(sa.utm_source, 'direct') as source,
  count(*) filter (where rr.id is not null) as also_referral,
  count(*) filter (where rr.id is null) as no_referral,
  count(*) as total
from public.signup_attribution sa
left join public.referral_redemptions rr on rr.referred_user_id = sa.user_id
where sa.created_at >= now() - interval '30 days'
group by 1
order by total desc;
