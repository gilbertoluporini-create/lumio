-- ============================================================================
-- Migration: support tickets + admin audit log
-- ============================================================================
-- Rode no SQL Editor do Supabase. Idempotente — pode rodar várias vezes.
-- ============================================================================

-- 1) Tabela de tickets de suporte
create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  user_email text not null,
  user_name text,
  subject text not null,
  category text not null default 'duvida', -- 'duvida' | 'bug' | 'sugestao' | 'cobranca' | 'outro'
  message text not null,
  status text not null default 'open',     -- 'open' | 'in_progress' | 'resolved' | 'closed'
  priority text not null default 'normal', -- 'low' | 'normal' | 'high'
  admin_reply text,
  replied_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists support_tickets_user_id_idx on public.support_tickets(user_id);
create index if not exists support_tickets_status_idx on public.support_tickets(status);
create index if not exists support_tickets_created_idx on public.support_tickets(created_at desc);

-- Trigger pra updated_at
create or replace function public.touch_support_tickets_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists support_tickets_touch_updated_at on public.support_tickets;
create trigger support_tickets_touch_updated_at
  before update on public.support_tickets
  for each row execute function public.touch_support_tickets_updated_at();

-- RLS
alter table public.support_tickets enable row level security;

drop policy if exists "users insert own tickets" on public.support_tickets;
create policy "users insert own tickets" on public.support_tickets
  for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "users see own tickets" on public.support_tickets;
create policy "users see own tickets" on public.support_tickets
  for select to authenticated
  using (auth.uid() = user_id);
-- Admin reads/updates: feitos via service-role client nas API routes /api/admin/*

-- 2) Tabela de audit log de ações administrativas
create table if not exists public.admin_actions (
  id uuid primary key default gen_random_uuid(),
  admin_email text not null,
  action text not null,                -- 'reset_password', 'grant_coins', 'ban', 'impersonate', etc
  target_user_id uuid,
  target_user_email text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_actions_admin_email_idx on public.admin_actions(admin_email);
create index if not exists admin_actions_target_idx on public.admin_actions(target_user_id);
create index if not exists admin_actions_created_idx on public.admin_actions(created_at desc);

alter table public.admin_actions enable row level security;
-- Sem policies: apenas service_role consegue ler/escrever.

-- 3) Tabela opcional de config app-wide (banner global, etc)
create table if not exists public.app_config (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by text
);

alter table public.app_config enable row level security;

drop policy if exists "anyone reads app_config" on public.app_config;
create policy "anyone reads app_config" on public.app_config
  for select using (true);

-- Notas:
-- - Suspensão de usuários é feita via Supabase Auth Admin API:
--     supabase.auth.admin.updateUserById(id, { ban_duration: '876000h' })
--   Não precisa de coluna extra em auth.users (que não pode ser alterada via SQL).
