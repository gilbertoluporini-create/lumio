-- ============================================================================
-- Lumio — Supabase schema
-- Rode esse arquivo no SQL Editor do Supabase (cole tudo, clique Run)
-- ============================================================================

-- Tabelas
create table if not exists profiles (
  id uuid primary key references auth.users on delete cascade,
  email text not null unique,
  name text,
  role text not null default 'user' check (role in ('user', 'admin')),
  onboarded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  plan text not null default 'free' check (plan in ('free', 'pro', 'annual')),
  status text not null default 'inactive' check (
    status in ('inactive', 'active', 'past_due', 'canceled', 'incomplete', 'trialing')
  ),
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists subscriptions_user_id_idx on subscriptions (user_id);

create table if not exists subjects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  name text not null,
  color text not null default 'from-indigo-500 to-violet-500',
  schedule jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists subjects_user_id_idx on subjects (user_id);
-- Migração idempotente: adiciona coluna em DBs que já existiam sem ela
alter table subjects add column if not exists schedule jsonb not null default '[]'::jsonb;

create table if not exists lectures (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  subject_id uuid references subjects on delete set null,
  title text not null,
  transcript text not null default '',
  duration_sec integer not null default 0,
  status text not null default 'draft' check (status in ('draft', 'live', 'completed')),
  slides_file_name text,
  slides jsonb,
  summary jsonb,
  messages jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists lectures_user_id_idx on lectures (user_id);
create index if not exists lectures_subject_id_idx on lectures (subject_id);

create table if not exists stripe_events (
  id text primary key,
  type text not null,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

-- ============================================================================
-- Triggers
-- ============================================================================

-- Auto-criar profile quando user se cadastra
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1))
  );
  insert into public.subscriptions (user_id, plan, status)
  values (new.id, 'free', 'inactive');
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- updated_at automático
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch on profiles;
create trigger profiles_touch before update on profiles
  for each row execute function public.touch_updated_at();
drop trigger if exists subscriptions_touch on subscriptions;
create trigger subscriptions_touch before update on subscriptions
  for each row execute function public.touch_updated_at();
drop trigger if exists lectures_touch on lectures;
create trigger lectures_touch before update on lectures
  for each row execute function public.touch_updated_at();

-- ============================================================================
-- RLS
-- ============================================================================
alter table profiles enable row level security;
alter table subscriptions enable row level security;
alter table subjects enable row level security;
alter table lectures enable row level security;
alter table stripe_events enable row level security;
-- stripe_events: sem policy = ninguém via anon/auth key (só service role)

drop policy if exists profiles_self_select on profiles;
create policy profiles_self_select on profiles for select
  using (auth.uid() = id);

drop policy if exists profiles_self_update on profiles;
create policy profiles_self_update on profiles for update
  using (auth.uid() = id)
  with check (
    auth.uid() = id
    -- impede self-promote: role nova precisa ser igual à atual no DB
    and role = (select role from profiles where id = auth.uid())
  );

drop policy if exists subscriptions_self_select on subscriptions;
create policy subscriptions_self_select on subscriptions for select
  using (auth.uid() = user_id);
-- INSERT/UPDATE só via service role (webhook Stripe)

drop policy if exists subjects_owner_all on subjects;
create policy subjects_owner_all on subjects for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists lectures_owner_all on lectures;
create policy lectures_owner_all on lectures for all
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and (
      subject_id is null
      or exists (select 1 from subjects s where s.id = subject_id and s.user_id = auth.uid())
    )
  );

-- ============================================================================
-- Helper: tornar usuário admin (rodar UMA vez após primeiro login)
-- ============================================================================
-- Substitua o email se necessário:
-- update profiles set role = 'admin' where email = 'gilbertoluporini@gmail.com';
