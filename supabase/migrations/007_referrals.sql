-- ============================================================================
-- Migration: referrals — Programa de Embaixadores Lumio
-- ============================================================================
-- Cada usuário ativo ganha um código único `LUMI-XXXX` (auto-gerado on demand).
-- Quando outro user faz signup com `?ref=CODIGO` na URL → registra redemption.
-- Quando esse usuário paga assinatura → status muda pra "paid" e calcula recompensa.
--
-- Recompensa (MVP): 1 mês Pro grátis pro indicador a cada amigo que paga.
-- Lógica de aplicar o crédito é manual no início — admin vê fila e aciona.
-- ============================================================================

-- Tabela 1: códigos (1 por usuário, criado on-demand)
create table if not exists public.referral_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade unique,
  code text not null unique,
  created_at timestamptz not null default now(),
  -- Stats agregadas (atualizadas via triggers ou recálculo)
  total_clicks int not null default 0,
  total_signups int not null default 0,
  total_paid int not null default 0,
  total_reward_brl numeric(10, 2) not null default 0
);

create index if not exists referral_codes_user_idx on public.referral_codes(user_id);
create index if not exists referral_codes_code_idx on public.referral_codes(code);

-- Tabela 2: redemptions (1 linha por amigo trazido)
create table if not exists public.referral_redemptions (
  id uuid primary key default gen_random_uuid(),
  referral_code_id uuid not null references public.referral_codes(id) on delete cascade,
  referrer_user_id uuid not null references auth.users on delete cascade,
  referred_user_id uuid not null references auth.users on delete cascade unique, -- 1 user pode ser referido só 1x
  status text not null default 'signed_up' check (
    status in ('signed_up', 'activated', 'paid', 'churned', 'fraud')
  ),
  -- Tracking
  signed_up_at timestamptz not null default now(),
  activated_at timestamptz, -- 1ª aula gravada
  paid_at timestamptz,      -- 1ª assinatura paga
  plan text,                -- starter / pro / power / annual
  -- Reward
  reward_brl numeric(10, 2) default 0,
  reward_applied boolean not null default false,
  reward_applied_at timestamptz,
  reward_note text,
  -- Anti-fraude
  ip_address inet,
  user_agent text,
  metadata jsonb,
  -- Audit
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists referral_redemptions_code_idx on public.referral_redemptions(referral_code_id);
create index if not exists referral_redemptions_referrer_idx on public.referral_redemptions(referrer_user_id);
create index if not exists referral_redemptions_referred_idx on public.referral_redemptions(referred_user_id);
create index if not exists referral_redemptions_status_idx on public.referral_redemptions(status);
create index if not exists referral_redemptions_created_idx on public.referral_redemptions(created_at desc);

-- Tabela 3: clicks (analytics — opcional mas barato)
create table if not exists public.referral_clicks (
  id uuid primary key default gen_random_uuid(),
  referral_code_id uuid references public.referral_codes(id) on delete set null,
  code text not null, -- denormalizado pra debug se ref deletado
  ip_address inet,
  user_agent text,
  referrer_url text, -- ex: instagram.com, tiktok.com
  utm_source text,
  utm_medium text,
  utm_campaign text,
  created_at timestamptz not null default now()
);

create index if not exists referral_clicks_code_idx on public.referral_clicks(referral_code_id);
create index if not exists referral_clicks_created_idx on public.referral_clicks(created_at desc);

-- ============================================================================
-- RLS — segurança
-- ============================================================================
alter table public.referral_codes enable row level security;
alter table public.referral_redemptions enable row level security;
alter table public.referral_clicks enable row level security;

-- Codes: user vê o próprio código
drop policy if exists "referral_codes_select_own" on public.referral_codes;
create policy "referral_codes_select_own"
  on public.referral_codes for select
  using (auth.uid() = user_id);

-- User pode INSERT o próprio código (auto-criação on demand)
drop policy if exists "referral_codes_insert_own" on public.referral_codes;
create policy "referral_codes_insert_own"
  on public.referral_codes for insert
  with check (auth.uid() = user_id);

-- Redemptions: user vê redemptions onde ele é o referrer
drop policy if exists "referral_redemptions_select_as_referrer" on public.referral_redemptions;
create policy "referral_redemptions_select_as_referrer"
  on public.referral_redemptions for select
  using (auth.uid() = referrer_user_id);

-- Clicks: ninguém lê via RLS (só service_role)
-- (sem policy = bloqueado por default com RLS ativo)

-- ============================================================================
-- Trigger: updated_at automático em redemptions
-- ============================================================================
create or replace function public.referral_redemptions_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists referral_redemptions_updated_at_trg on public.referral_redemptions;
create trigger referral_redemptions_updated_at_trg
  before update on public.referral_redemptions
  for each row
  execute function public.referral_redemptions_set_updated_at();

-- ============================================================================
-- Função: gerar código único formato LUMI-XXXX (XXXX = 4 chars alfanum)
-- ============================================================================
create or replace function public.generate_referral_code()
returns text
language plpgsql
as $$
declare
  new_code text;
  attempts int := 0;
  charset text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- sem chars confusos (0/O/1/I/L)
  i int;
begin
  loop
    new_code := 'LUMI-';
    for i in 1..4 loop
      new_code := new_code || substr(charset, floor(random() * length(charset) + 1)::int, 1);
    end loop;

    -- Confere unicidade
    if not exists (select 1 from public.referral_codes where code = new_code) then
      return new_code;
    end if;

    attempts := attempts + 1;
    if attempts > 50 then
      raise exception 'Could not generate unique referral code after 50 attempts';
    end if;
  end loop;
end;
$$;

-- ============================================================================
-- Função: atualizar stats agregadas no referral_codes
-- ============================================================================
create or replace function public.refresh_referral_stats(p_code_id uuid)
returns void
language plpgsql
as $$
begin
  update public.referral_codes
  set
    total_clicks = (select count(*) from public.referral_clicks where referral_code_id = p_code_id),
    total_signups = (select count(*) from public.referral_redemptions where referral_code_id = p_code_id),
    total_paid = (select count(*) from public.referral_redemptions where referral_code_id = p_code_id and status = 'paid'),
    total_reward_brl = (select coalesce(sum(reward_brl), 0) from public.referral_redemptions where referral_code_id = p_code_id and status = 'paid')
  where id = p_code_id;
end;
$$;

-- ============================================================================
-- Trigger: refresh stats quando redemption muda
-- ============================================================================
create or replace function public.referral_redemptions_refresh_stats_trigger()
returns trigger
language plpgsql
as $$
begin
  perform public.refresh_referral_stats(coalesce(new.referral_code_id, old.referral_code_id));
  return coalesce(new, old);
end;
$$;

drop trigger if exists referral_redemptions_stats_trg on public.referral_redemptions;
create trigger referral_redemptions_stats_trg
  after insert or update or delete on public.referral_redemptions
  for each row
  execute function public.referral_redemptions_refresh_stats_trigger();

-- Same pros clicks
create or replace function public.referral_clicks_refresh_stats_trigger()
returns trigger
language plpgsql
as $$
begin
  if new.referral_code_id is not null then
    perform public.refresh_referral_stats(new.referral_code_id);
  end if;
  return new;
end;
$$;

drop trigger if exists referral_clicks_stats_trg on public.referral_clicks;
create trigger referral_clicks_stats_trg
  after insert on public.referral_clicks
  for each row
  execute function public.referral_clicks_refresh_stats_trigger();
