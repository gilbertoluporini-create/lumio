-- ============================================================================
-- Migration 022: Subscription real amount (do Stripe price)
-- ============================================================================
-- O painel /admin/usage estimava receita por uma tabela fixa (pro=R$100,
-- power=R$999) que estava errada. Os preços reais (Stripe, BRL):
--   Starter R$39/mês · Pro R$69/mês · Power R$119/mês
--   anuais: Starter R$390 · Pro R$690 · Power R$1.190 (cobrança/ano)
--
-- O webhook mapeia tanto o preço mensal quanto o anual pro mesmo `plan`
-- (ex: pro anual → plan="pro"), então `plan` NÃO distingue mensal de anual.
-- Por isso guardamos o unit_amount + interval direto do price, e o painel
-- normaliza pra mensal (anual ÷ 12) ao calcular MRR/margem.
--
-- Mudanças:
--   - +amount_cents (int) — unit_amount do price (na moeda cobrada)
--   - +currency (text) — moeda do price (ex 'brl')
--   - +billing_interval (text) — 'month' | 'year' (de price.recurring.interval)
-- ============================================================================

alter table public.subscriptions
  add column if not exists amount_cents integer,
  add column if not exists currency text,
  add column if not exists billing_interval text;
