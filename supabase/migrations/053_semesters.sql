-- Semestres: agrupa matérias (e por elas, aulas/assets) por período acadêmico.
-- Cada user tem N semestres; 1 ativo por vez (user_profiles.active_semester_id).
-- Trocar de semestre só muda o que aparece na UI — nada é apagado.
-- Migração aditiva e idempotente: roda em DB já populado sem perder dados.

create table if not exists public.semesters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);
create index if not exists semesters_user_id_idx on public.semesters (user_id);

alter table public.semesters enable row level security;

do $$ begin
  create policy "semesters_own_select" on public.semesters
    for select using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "semesters_own_insert" on public.semesters
    for insert with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "semesters_own_update" on public.semesters
    for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "semesters_own_delete" on public.semesters
    for delete using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

-- Vincula matéria a um semestre. on delete cascade: apagar um semestre (ação
-- EXPLÍCITA do user) leva junto as matérias dele e, pela cascata já existente
-- em lectures/summaries/etc, todos os assets daquele período.
alter table public.subjects
  add column if not exists semester_id uuid references public.semesters(id) on delete cascade;
create index if not exists subjects_semester_id_idx on public.subjects (semester_id);

-- Semestre ativo por user. on delete set null: se o semestre ativo for apagado,
-- o profile só perde o ponteiro (o app cai pro semestre mais recente restante).
alter table public.user_profiles
  add column if not exists active_semester_id uuid references public.semesters(id) on delete set null;

-- BACKFILL: todo user que já tem matérias sem semestre ganha um "Semestre atual",
-- todas as suas matérias passam a apontar pra ele, e vira o semestre ativo.
-- Ninguém perde matéria, aula ou arquivo.
do $$
declare
  u record;
  new_sem uuid;
begin
  for u in
    select distinct user_id from public.subjects where semester_id is null
  loop
    insert into public.semesters (user_id, name)
      values (u.user_id, 'Semestre atual')
      returning id into new_sem;

    update public.subjects
      set semester_id = new_sem
      where user_id = u.user_id and semester_id is null;

    insert into public.user_profiles (user_id, active_semester_id)
      values (u.user_id, new_sem)
      on conflict (user_id) do update
        set active_semester_id = coalesce(public.user_profiles.active_semester_id, excluded.active_semester_id);
  end loop;
end $$;
