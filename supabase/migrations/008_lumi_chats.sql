-- ============================================================================
-- Migration: lumi_chats — Persistência dos chats do Assistente Lumi
-- ============================================================================
-- Hoje os chats ficam só em localStorage. Isso quebra UX entre devices e
-- significa que o user paga assinatura, troca de aparelho e perde tudo.
-- Esta tabela move pra Supabase com RLS owner-based.
--
-- Sync strategy no client: localStorage continua sendo cache rápido, mas
-- toda mutation faz upsert no DB em background, e o hub de chats hidrata
-- do server no mount.
-- ============================================================================

create table if not exists public.lumi_chats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  title text not null,
  subject_id uuid,
  subject_name text,
  category text check (
    category in ('summary', 'flashcards', 'quiz', 'translate', 'explain', 'chat')
  ),
  messages jsonb not null default '[]'::jsonb,
  pinned boolean not null default false,
  starred boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists lumi_chats_user_idx on public.lumi_chats(user_id);
create index if not exists lumi_chats_updated_idx
  on public.lumi_chats(user_id, updated_at desc);
create index if not exists lumi_chats_pinned_idx
  on public.lumi_chats(user_id, pinned)
  where pinned = true;

-- ============================================================================
-- RLS
-- ============================================================================
alter table public.lumi_chats enable row level security;

drop policy if exists "users select own lumi_chats" on public.lumi_chats;
create policy "users select own lumi_chats" on public.lumi_chats
  for select using (auth.uid() = user_id);

drop policy if exists "users insert own lumi_chats" on public.lumi_chats;
create policy "users insert own lumi_chats" on public.lumi_chats
  for insert with check (auth.uid() = user_id);

drop policy if exists "users update own lumi_chats" on public.lumi_chats;
create policy "users update own lumi_chats" on public.lumi_chats
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "users delete own lumi_chats" on public.lumi_chats;
create policy "users delete own lumi_chats" on public.lumi_chats
  for delete using (auth.uid() = user_id);

-- ============================================================================
-- Trigger: updated_at automático
-- ============================================================================
create or replace function public.touch_lumi_chats_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists lumi_chats_touch_updated_at on public.lumi_chats;
create trigger lumi_chats_touch_updated_at
  before update on public.lumi_chats
  for each row execute function public.touch_lumi_chats_updated_at();
