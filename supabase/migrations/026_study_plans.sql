-- ============================================================================
-- Migration 026: Plano de Estudos — trilha guiada
-- ============================================================================
-- Duas tabelas:
--   * study_plans       — 1 plano por matéria/prova (título, data, status)
--   * study_plan_items  — itens ordenados da trilha (doc / resumo / mapa /
--                         quiz / flashcards / rotina / nota livre)
--
-- Items NÃO duplicam o conteúdo dos assets — só apontam pra eles via
-- asset_id (mantém referência solta, sem FK rígida porque cada kind aponta
-- pra uma tabela diferente).
-- ============================================================================

create extension if not exists "pgcrypto";

create table if not exists public.study_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject_id uuid references public.subjects(id) on delete set null,
  title text not null,
  exam_date date,
  status text not null default 'active'
    check (status in ('active', 'done', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists study_plans_user_status_idx
  on public.study_plans (user_id, status, created_at desc);

create index if not exists study_plans_subject_idx
  on public.study_plans (subject_id);

create table if not exists public.study_plan_items (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.study_plans(id) on delete cascade,
  position int not null default 0,
  kind text not null
    check (kind in ('document', 'summary', 'mindmap', 'quiz',
                    'flashcards', 'routine', 'note')),
  asset_id uuid,
  title text not null,
  description text,
  status text not null default 'pending'
    check (status in ('pending', 'in_progress', 'done')),
  due_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists study_plan_items_plan_position_idx
  on public.study_plan_items (plan_id, position);

create index if not exists study_plan_items_plan_status_idx
  on public.study_plan_items (plan_id, status);

-- updated_at auto
create or replace function public.touch_study_plans_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists study_plans_touch_updated_at on public.study_plans;
create trigger study_plans_touch_updated_at
  before update on public.study_plans
  for each row execute function public.touch_study_plans_updated_at();

-- RLS
alter table public.study_plans enable row level security;
alter table public.study_plan_items enable row level security;

drop policy if exists "study_plans_select_own" on public.study_plans;
create policy "study_plans_select_own" on public.study_plans
  for select using (auth.uid() = user_id);

drop policy if exists "study_plans_modify_own" on public.study_plans;
create policy "study_plans_modify_own" on public.study_plans
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "study_plan_items_select_own" on public.study_plan_items;
create policy "study_plan_items_select_own" on public.study_plan_items
  for select using (exists (
    select 1 from public.study_plans p
    where p.id = study_plan_items.plan_id and p.user_id = auth.uid()
  ));

drop policy if exists "study_plan_items_modify_own" on public.study_plan_items;
create policy "study_plan_items_modify_own" on public.study_plan_items
  for all using (exists (
    select 1 from public.study_plans p
    where p.id = study_plan_items.plan_id and p.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.study_plans p
    where p.id = study_plan_items.plan_id and p.user_id = auth.uid()
  ));
