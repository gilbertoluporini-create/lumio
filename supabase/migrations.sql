-- ============================================================================
-- LUMIO — Migrations adicionais (idempotente, pode rodar quantas vezes quiser)
-- ============================================================================

-- 1) Schedule nas matérias (Cronograma)
alter table subjects
  add column if not exists schedule jsonb not null default '[]'::jsonb;

-- 2) Sistema de Lumio Coins
alter table profiles
  add column if not exists coin_balance integer not null default 0;
alter table profiles
  add column if not exists coins_reset_at timestamptz;
alter table profiles
  add column if not exists last_topup_at timestamptz;

-- Histórico de transações (todo débito e crédito)
create table if not exists coin_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  amount integer not null,                  -- positivo = crédito, negativo = débito
  reason text not null,                     -- 'subscription_renew', 'topup', 'chat', 'slides', 'summary', 'transcript_refine', 'welcome_bonus', 'admin_grant'
  balance_after integer not null,
  metadata jsonb,                           -- { lecture_id?, plan?, etc }
  created_at timestamptz not null default now()
);
create index if not exists coin_transactions_user_id_idx
  on coin_transactions (user_id, created_at desc);

-- RLS: user vê apenas as próprias transações; writes só via service_role (bypassa RLS)
alter table coin_transactions enable row level security;

drop policy if exists coin_transactions_owner_read on coin_transactions;
create policy coin_transactions_owner_read on coin_transactions for select
  using (auth.uid() = user_id);

-- 3) Bônus de boas-vindas: 50 coins ao criar profile
create or replace function public.handle_new_user_coins()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  -- 50 coins de boas vindas (1 aula teste)
  update profiles set coin_balance = 50 where id = new.id;
  insert into coin_transactions (user_id, amount, reason, balance_after, metadata)
    values (new.id, 50, 'welcome_bonus', 50, jsonb_build_object('grant_type', 'free_trial'));
  return new;
end;
$$;

drop trigger if exists on_profile_created_grant_coins on profiles;
create trigger on_profile_created_grant_coins
  after insert on profiles
  for each row execute function public.handle_new_user_coins();

-- 4) Bônus retroativo: usuários já existentes ganham 50 coins (uma única vez)
update profiles
  set coin_balance = 50
  where coin_balance = 0
    and not exists (
      select 1 from coin_transactions ct where ct.user_id = profiles.id
    );

insert into coin_transactions (user_id, amount, reason, balance_after, metadata)
  select id, 50, 'welcome_bonus', 50, jsonb_build_object('grant_type', 'retroactive')
  from profiles
  where coin_balance = 50
    and not exists (
      select 1 from coin_transactions ct where ct.user_id = profiles.id
    );

-- ============================================================================
-- 5) Limite mensal de aulas (v2 pricing — basais grátis com cap de aulas)
-- ============================================================================
alter table profiles
  add column if not exists monthly_lectures_used integer not null default 0;
alter table profiles
  add column if not exists monthly_lectures_reset_at timestamptz;

-- ============================================================================
-- 6) Assets gerados por aula (produtos: resumos, flashcards, quiz, mindmap)
-- ============================================================================
create table if not exists lecture_assets (
  id uuid primary key default gen_random_uuid(),
  lecture_id uuid not null references lectures on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  kind text not null check (kind in ('summary', 'flashcards', 'quiz', 'mindmap')),
  payload jsonb not null,
  coins_spent integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists lecture_assets_lecture_id_idx
  on lecture_assets (lecture_id, kind);
create index if not exists lecture_assets_user_id_idx
  on lecture_assets (user_id, created_at desc);

alter table lecture_assets enable row level security;

drop policy if exists lecture_assets_owner_all on lecture_assets;
create policy lecture_assets_owner_all on lecture_assets for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop trigger if exists lecture_assets_touch on lecture_assets;
create trigger lecture_assets_touch before update on lecture_assets
  for each row execute function public.touch_updated_at();

-- ============================================================================
-- 7) Storage bucket pra PDFs originais (uploadados)
-- ============================================================================
-- Rodar manualmente no Supabase Dashboard → Storage:
--   1. Criar bucket "lecture-uploads" (private)
--   2. RLS policies abaixo
-- (Comentado porque storage policies podem variar entre projetos)
-- create policy "lecture-uploads owner read"
--   on storage.objects for select to authenticated
--   using (bucket_id = 'lecture-uploads' and (storage.foldername(name))[1] = auth.uid()::text);
-- create policy "lecture-uploads owner insert"
--   on storage.objects for insert to authenticated
--   with check (bucket_id = 'lecture-uploads' and (storage.foldername(name))[1] = auth.uid()::text);
-- create policy "lecture-uploads owner delete"
--   on storage.objects for delete to authenticated
--   using (bucket_id = 'lecture-uploads' and (storage.foldername(name))[1] = auth.uid()::text);
