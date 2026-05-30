-- ============================================================================
-- Migration 027 — Programa de Embaixadores v2
-- ============================================================================
-- Migra do modelo "1 mês Pro grátis" pra modelo Chagas-style:
--   - Cupom personalizado no Stripe (ex: LARI10) dá 10% off pro buyer
--   - Embaixador recebe 25% de comissão recorrente via PIX mensal
--
-- Backward compatible — campos legados (total_reward_brl) ficam zerados
-- pros embaixadores novos. Admin paga manualmente com base em SUMs.
-- ============================================================================

-- Cupom personalizado Stripe (ex: "LARI10")
-- Criado manualmente pelo admin no dashboard Stripe e linkado aqui.
alter table public.referral_codes
  add column if not exists coupon_code text;

create unique index if not exists referral_codes_coupon_idx
  on public.referral_codes(coupon_code)
  where coupon_code is not null;

-- Chave PIX pra recebimento da comissão
alter table public.referral_codes
  add column if not exists pix_key text;

-- % de comissão (default 25%, configurável por embaixador)
alter table public.referral_codes
  add column if not exists commission_rate numeric(5, 4) not null default 0.25;

-- Comentário do admin (notas internas)
alter table public.referral_codes
  add column if not exists admin_notes text;

comment on column public.referral_codes.coupon_code is
  'Cupom Stripe personalizado (ex: LARI10) — criado manualmente no Stripe Dashboard';
comment on column public.referral_codes.pix_key is
  'Chave PIX (CPF/email/celular/aleatória) — pra pagamento mensal de comissão';
comment on column public.referral_codes.commission_rate is
  '% de comissão recorrente sobre valor pago. Default 0.25 (25%)';
comment on column public.referral_codes.admin_notes is
  'Notas internas do admin sobre o embaixador (negociações especiais, performance, etc.)';

-- ============================================================================
-- Tabela de pagamentos de comissão (audit trail dos PIX feitos)
-- ============================================================================
create table if not exists public.ambassador_payouts (
  id uuid primary key default gen_random_uuid(),
  referral_code_id uuid not null references public.referral_codes(id) on delete cascade,
  ambassador_user_id uuid not null references auth.users on delete cascade,
  -- Período coberto
  period_start date not null,
  period_end date not null,
  -- Valores
  gross_revenue_brl numeric(10, 2) not null,
  commission_rate numeric(5, 4) not null,
  commission_brl numeric(10, 2) not null,
  -- Pagamento
  pix_key text not null,
  pix_paid_at timestamptz,
  pix_transaction_id text,
  status text not null default 'pending' check (
    status in ('pending', 'paid', 'failed', 'cancelled')
  ),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ambassador_payouts_user_idx
  on public.ambassador_payouts(ambassador_user_id);
create index if not exists ambassador_payouts_period_idx
  on public.ambassador_payouts(period_start, period_end);
create index if not exists ambassador_payouts_status_idx
  on public.ambassador_payouts(status);

alter table public.ambassador_payouts enable row level security;

-- Embaixador vê só seus próprios payouts
create policy "Ambassador reads own payouts"
  on public.ambassador_payouts for select
  using (ambassador_user_id = auth.uid());

-- Admin (via service role) faz tudo
-- (service role bypassa RLS automaticamente — sem policy necessária)

-- ============================================================================
-- Function: calcula comissão estimada do mês corrente
-- ============================================================================
-- Soma valores pagos no mês via redemptions, multiplica pela commission_rate
-- do embaixador. Útil pra mostrar no dashboard.
create or replace function public.ambassador_estimated_commission(
  p_user_id uuid,
  p_month_start date default date_trunc('month', now())::date
)
returns numeric
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(sum(r.reward_brl), 0)::numeric(10, 2)
  from referral_redemptions r
  join referral_codes c on c.id = r.referral_code_id
  where r.referrer_user_id = p_user_id
    and r.status = 'paid'
    and r.paid_at >= p_month_start
    and r.paid_at < (p_month_start + interval '1 month');
$$;

comment on function public.ambassador_estimated_commission is
  'Soma reward_brl das redemptions pagas no mês corrente. Admin usa pra calcular PIX mensal.';
