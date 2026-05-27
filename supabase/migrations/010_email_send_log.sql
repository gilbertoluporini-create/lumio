-- 010_email_send_log.sql
-- Idempotência de envio de emails de onboarding (day1/day3/day7/day14).
-- Garante que o cron não envie 2× o mesmo step pro mesmo user.

create table if not exists public.email_send_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email_kind text not null,
  sent_at timestamptz not null default now(),
  unique (user_id, email_kind)
);

create index if not exists email_send_log_user_kind_idx
  on public.email_send_log (user_id, email_kind);

-- RLS: ninguém precisa ler isso pelo cliente, só service_role.
alter table public.email_send_log enable row level security;
