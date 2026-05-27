-- ============================================================================
-- Migration 016: Signup Attribution
-- ============================================================================
-- Armazena UTMs + click IDs capturados no client (localStorage `lumio.attribution`)
-- no momento do signup. JSONB pra flexibilidade — colunas geradas (extracted)
-- pros campos mais usados em queries (utm_source/medium/campaign) tornam
-- index/filtragem barato.
--
-- Decisão: tabela auxiliar (não estende `profiles`) porque:
--   1. Attribution é write-once-read-mostly — não polui hot path do profile.
--   2. Pode haver multi-touch no futuro (sessões diferentes do mesmo user antes
--      do signup) — basta trocar PK por (user_id, captured_at).
--   3. Não impacta migrations existentes em profiles.
-- ============================================================================

create table if not exists public.signup_attribution (
  user_id uuid primary key references auth.users(id) on delete cascade,

  -- Atribuição completa (last-touch wins na hora do signup)
  attribution jsonb not null default '{}'::jsonb,

  -- Colunas extraídas pra index/filter rápido (90% das queries vão filtrar por isso)
  utm_source text generated always as (attribution->>'source') stored,
  utm_medium text generated always as (attribution->>'medium') stored,
  utm_campaign text generated always as (attribution->>'campaign') stored,
  first_utm_source text generated always as (attribution->>'firstSource') stored,
  channel text generated always as (attribution->>'channel') stored,
  gclid text generated always as (attribution->>'gclid') stored,
  fbclid text generated always as (attribution->>'fbclid') stored,
  ttclid text generated always as (attribution->>'ttclid') stored,

  -- Quando o registro foi criado (= momento do signup)
  created_at timestamptz not null default now()
);

create index if not exists signup_attribution_source_idx
  on public.signup_attribution(utm_source);
create index if not exists signup_attribution_first_source_idx
  on public.signup_attribution(first_utm_source);
create index if not exists signup_attribution_campaign_idx
  on public.signup_attribution(utm_campaign);
create index if not exists signup_attribution_created_idx
  on public.signup_attribution(created_at desc);
-- Index pra detectar paid traffic (qualquer click ID presente)
create index if not exists signup_attribution_paid_idx
  on public.signup_attribution(created_at desc)
  where gclid is not null or fbclid is not null or ttclid is not null;

-- ============================================================================
-- RLS
-- ============================================================================
alter table public.signup_attribution enable row level security;

-- User pode ler a própria attribution (debug / "como você nos achou?" survey)
drop policy if exists "signup_attribution_select_own" on public.signup_attribution;
create policy "signup_attribution_select_own"
  on public.signup_attribution for select
  using (auth.uid() = user_id);

-- Writes apenas via service_role (endpoint /api/auth/signup-password)
-- Sem policy de insert/update/delete → bloqueado por default.
