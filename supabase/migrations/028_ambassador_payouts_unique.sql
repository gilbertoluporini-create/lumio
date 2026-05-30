-- ============================================================================
-- Migration 028 — Unique constraint em ambassador_payouts pra upsert mensal
-- ============================================================================
-- O webhook Stripe acumula comissão por embaixador POR MÊS via upsert.
-- Sem unique (referral_code_id, period_start), o upsert vira insert duplicado.
--
-- period_start é sempre o 1º dia do mês (truncado).
-- ============================================================================

alter table public.ambassador_payouts
  add constraint ambassador_payouts_unique_month
  unique (referral_code_id, period_start);

comment on constraint ambassador_payouts_unique_month
  on public.ambassador_payouts is
  '1 payout por embaixador por mês. Webhook upserta acumulando gross_revenue + commission.';
