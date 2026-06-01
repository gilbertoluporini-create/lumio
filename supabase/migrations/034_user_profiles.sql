-- Perfil do user coletado no onboarding (e editável depois). Vira CONTEXTO
-- pro agente Lumi a cada turn — em vez de inferir nível/objetivo/estilo do
-- user, o agente lê esse perfil e adapta tom e sugestões.
--
-- Todos os campos são opcionais: user pode pular qualquer pergunta no
-- onboarding e voltar depois.

create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  -- Identidade acadêmica
  course text,                 -- ex: 'Medicina', 'Direito', 'Engenharia'
  semester text,               -- ex: '4º semestre', '6º período'
  graduation_year integer,     -- ex: 2028
  -- Direcionamento
  goal text,                   -- 'pass_year' | 'residency' | 'public_exam' | 'learn' | livre
  difficulty_subjects text[],  -- ex: ['Endócrino', 'Farmacologia']
  study_style text,            -- 'visual' | 'textual' | 'practical' | 'mixed'
  -- Rotina típica
  study_hours_per_day numeric, -- 0.5 a 12
  best_study_time text,        -- 'morning' | 'afternoon' | 'evening' | 'late_night' | 'flexible'
  -- Calendário extraído por IA (ou inserido depois)
  exam_dates jsonb,            -- [{subject: 'Endócrino', date: '2026-06-15', note?: ''}]
  -- Memória livre — qualquer info adicional que o Lumi aprender ao longo dos chats
  free_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_profiles enable row level security;

create policy "user_profiles_own_select"
  on public.user_profiles for select
  using (auth.uid() = user_id);

create policy "user_profiles_own_insert"
  on public.user_profiles for insert
  with check (auth.uid() = user_id);

create policy "user_profiles_own_update"
  on public.user_profiles for update
  using (auth.uid() = user_id);

create or replace function public.set_user_profiles_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_user_profiles_updated_at on public.user_profiles;
create trigger trg_user_profiles_updated_at
  before update on public.user_profiles
  for each row
  execute function public.set_user_profiles_updated_at();
