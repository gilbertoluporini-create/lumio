-- ============================================================================
-- Migration 040: Magic Features — 5 tabelas pras "features mágicas" do Lumio
-- ============================================================================
-- Cada tabela suporta uma feature distinta. Todas com FK direto pra
-- auth.users e RLS habilitado (SELECT pelo dono; writes via service_role
-- exceto push_subscriptions, que o user gerencia direto).
--
-- Tabelas criadas:
--   1) lecture_document_links     — cross-link aula↔PDF (similaridade)
--   2) subject_mind_maps          — mapa mental incremental por matéria
--   3) exam_lecture_relevance     — smart prep: prova ↔ resumos/aulas/docs
--   4) push_subscriptions         — Web Push API endpoints por user
--   5) notifications_log          — histórico de pushes disparados
--
-- Observação sobre exam_lecture_relevance.exam_id:
--   Eventos do calendário (incluindo provas) hoje vivem em localStorage
--   client-side (src/lib/calendar-events.ts). A tabela mais próxima de
--   "prova" no banco é public.study_plans, que tem `exam_date date` e
--   representa um plano de estudos atrelado a uma prova. Apontamos
--   exam_id pra study_plans com on delete cascade — quando o plano
--   for arquivado/removido, a relevância vai junto. Se no futuro
--   migrarmos eventos de prova pro DB em tabela própria, basta trocar
--   a FK aqui.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ============================================================================
-- 1) lecture_document_links — Cross-link aula↔PDF
-- ============================================================================
-- Quando o user sobe uma aula + PDFs, um job calcula similaridade
-- (embeddings) entre o conteúdo da aula e cada capítulo/PDF e persiste
-- aqui os links com confidence + páginas mais relevantes.
-- ============================================================================
create table if not exists public.lecture_document_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  lecture_id uuid not null references public.lectures(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  confidence_score float not null,
  matched_pages int[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (lecture_id, document_id)
);

create index if not exists lecture_document_links_user_idx
  on public.lecture_document_links (user_id);

create index if not exists lecture_document_links_lecture_idx
  on public.lecture_document_links (lecture_id);

alter table public.lecture_document_links enable row level security;

drop policy if exists lecture_document_links_owner_select
  on public.lecture_document_links;
create policy lecture_document_links_owner_select
  on public.lecture_document_links
  for select
  using (auth.uid() = user_id);

-- ============================================================================
-- 2) subject_mind_maps — Mapa mental incremental por matéria
-- ============================================================================
-- Toda aula nova de uma matéria atualiza o mapa mental persistente daquela
-- matéria (versão incrementa). 1 mapa por (user, subject).
-- Writes só via service_role (sem policy de INSERT/UPDATE).
-- ============================================================================
create table if not exists public.subject_mind_maps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  structure jsonb not null default '{"nodes":[],"edges":[]}'::jsonb,
  version int not null default 1,
  last_updated_lecture_id uuid references public.lectures(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (user_id, subject_id)
);

create index if not exists subject_mind_maps_user_idx
  on public.subject_mind_maps (user_id);

alter table public.subject_mind_maps enable row level security;

drop policy if exists subject_mind_maps_owner_select
  on public.subject_mind_maps;
create policy subject_mind_maps_owner_select
  on public.subject_mind_maps
  for select
  using (auth.uid() = user_id);

-- ============================================================================
-- 3) exam_lecture_relevance — Smart prep de prova
-- ============================================================================
-- Quando o user marca uma prova (study_plan com exam_date), o sistema
-- calcula relevância dos assets do user (lecture / document / summary) pra
-- aquela prova e popula esta tabela. UI mostra badge + ordering nos
-- resumos/aulas/docs mais relevantes.
--
-- Constraint: cada row aponta pra EXATAMENTE 1 alvo (lecture XOR document
-- XOR summary). Garante semântica clara — nada de duplo apontar.
-- ============================================================================
create table if not exists public.exam_lecture_relevance (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  exam_id uuid not null references public.study_plans(id) on delete cascade,
  lecture_id uuid references public.lectures(id) on delete cascade,
  document_id uuid references public.documents(id) on delete cascade,
  summary_id uuid references public.summaries(id) on delete cascade,
  relevance_score float not null,
  created_at timestamptz not null default now(),
  constraint exam_lecture_relevance_exactly_one_target
    check (
      (lecture_id is not null)::int
      + (document_id is not null)::int
      + (summary_id is not null)::int = 1
    )
);

create index if not exists exam_lecture_relevance_exam_idx
  on public.exam_lecture_relevance (exam_id);

create index if not exists exam_lecture_relevance_user_idx
  on public.exam_lecture_relevance (user_id);

alter table public.exam_lecture_relevance enable row level security;

drop policy if exists exam_lecture_relevance_owner_select
  on public.exam_lecture_relevance;
create policy exam_lecture_relevance_owner_select
  on public.exam_lecture_relevance
  for select
  using (auth.uid() = user_id);

-- ============================================================================
-- 4) push_subscriptions — Web Push API endpoints
-- ============================================================================
-- Cada device/browser registra um endpoint + chaves p256dh/auth_key.
-- User gerencia próprias subs (policy ALL).
-- ============================================================================
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth_key text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_active_at timestamptz not null default now(),
  unique (user_id, endpoint)
);

create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

drop policy if exists push_subscriptions_owner_all
  on public.push_subscriptions;
create policy push_subscriptions_owner_all
  on public.push_subscriptions
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ============================================================================
-- 5) notifications_log — histórico de pushes disparados
-- ============================================================================
-- Log append-only de notificações enviadas. Status evolui:
--   pending -> sent -> (clicked | failed)
-- ============================================================================
create table if not exists public.notifications_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  payload jsonb not null default '{}'::jsonb,
  dispatched_at timestamptz not null default now(),
  clicked_at timestamptz,
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'failed', 'clicked'))
);

create index if not exists notifications_log_user_dispatched_idx
  on public.notifications_log (user_id, dispatched_at desc);

alter table public.notifications_log enable row level security;

drop policy if exists notifications_log_owner_select
  on public.notifications_log;
create policy notifications_log_owner_select
  on public.notifications_log
  for select
  using (auth.uid() = user_id);
