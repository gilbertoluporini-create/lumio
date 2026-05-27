-- ============================================================================
-- Migration 018: Marketing Outbound + Embaixadores + Inbox
-- ============================================================================
-- Tabelas pro painel /admin/marketing:
--   1. outbound_drafts   — DMs draftadas por IA, status de envio manual (copy/paste)
--   2. embaixadores      — programa de embaixadores (Pro grátis em troca de divulgação)
--   3. inbox_messages    — mensagens recebidas via IG webhook + respostas draftadas
--
-- Decisões:
-- - Outbound: drafts NÃO são enviados via API (Graph API exige App Review pra DM
--   proativa). User copia/cola no IG manualmente. Painel rastreia status.
-- - Embaixadores: gestão simples — perfil + status + métricas de divulgação.
-- - Inbox: 24h response window do IG, marca quem precisa resposta urgente.
-- - RLS desativado: admin-only access via service role na API.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. OUTBOUND DRAFTS
-- ----------------------------------------------------------------------------
create table if not exists public.outbound_drafts (
  id uuid primary key default gen_random_uuid(),

  -- alvo
  platform text not null check (platform in ('instagram', 'tiktok', 'email', 'whatsapp')),
  handle text not null,                         -- @username ou email
  profile_url text,                             -- link público do perfil
  profile_research jsonb default '{}'::jsonb,   -- output da IA: curso, interesses, tom, etc

  -- conteúdo
  draft_text text not null,
  reasoning text,                               -- por que IA escolheu esse approach
  voice text default 'casual' check (voice in ('formal', 'casual', 'adaptive')),

  -- ranking / qualificação
  score numeric(3, 1),                          -- 0.0 a 10.0
  score_reason text,                            -- por que esse score

  -- status do envio
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'sent', 'replied', 'bounced')),
  approved_at timestamptz,
  sent_at timestamptz,
  replied_at timestamptz,

  -- métricas
  reply_text text,
  conversion boolean default false,             -- virou signup?
  conversion_user_id uuid references auth.users(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists outbound_drafts_status_idx
  on public.outbound_drafts (status, created_at desc);

create index if not exists outbound_drafts_platform_idx
  on public.outbound_drafts (platform, status);

create index if not exists outbound_drafts_handle_idx
  on public.outbound_drafts (handle);

-- ----------------------------------------------------------------------------
-- 2. EMBAIXADORES
-- ----------------------------------------------------------------------------
create table if not exists public.embaixadores (
  id uuid primary key default gen_random_uuid(),

  -- identidade
  user_id uuid references auth.users(id) on delete set null,  -- se virou user
  nome text not null,
  email text,
  handle_instagram text,
  handle_tiktok text,
  curso text,
  faculdade text,
  cidade text,

  -- status do programa
  status text not null default 'convidado'
    check (status in ('convidado', 'aceito', 'ativo', 'pausado', 'cancelado')),
  convidado_em timestamptz not null default now(),
  aceitou_em timestamptz,
  ativou_em timestamptz,                        -- 1ª divulgação confirmada

  -- benefício
  pro_concedido boolean default false,
  pro_concedido_em timestamptz,
  pro_expira_em timestamptz,

  -- métricas
  divulgacoes_count int default 0,              -- nº posts/stories que mencionaram
  signups_atribuidos int default 0,             -- usando UTM source=embaixador-<id>
  ultima_divulgacao_em timestamptz,

  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists embaixadores_status_idx
  on public.embaixadores (status, created_at desc);

create unique index if not exists embaixadores_user_id_uq
  on public.embaixadores (user_id)
  where user_id is not null;

-- ----------------------------------------------------------------------------
-- 3. INBOX MESSAGES (IG webhook)
-- ----------------------------------------------------------------------------
create table if not exists public.inbox_messages (
  id uuid primary key default gen_random_uuid(),

  -- origem
  platform text not null check (platform in ('instagram', 'facebook')),
  external_id text,                             -- ID da mensagem na plataforma (idempotência)
  conversation_id text,                         -- thread IG

  -- partes
  from_handle text not null,
  from_user_id text,                            -- IGSID do remetente
  to_handle text not null default 'lumioapp.br',

  -- conteúdo
  message_type text not null default 'text'
    check (message_type in ('text', 'image', 'video', 'audio', 'story_reply', 'comment')),
  message_text text,
  attachment_url text,

  -- janela 24h IG (preenchido via trigger pra Postgres aceitar como immutable)
  received_at timestamptz not null default now(),
  response_deadline timestamptz not null default (now() + interval '24 hours'),

  -- resposta
  reply_draft text,                             -- gerado pela IA
  reply_text text,                              -- o que foi efetivamente enviado
  replied_at timestamptz,
  status text not null default 'unread'
    check (status in ('unread', 'drafted', 'replied', 'archived', 'expired')),

  -- vínculo com outbound (se for resposta a uma DM que mandamos)
  outbound_draft_id uuid references public.outbound_drafts(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists inbox_messages_external_id_uq
  on public.inbox_messages (platform, external_id)
  where external_id is not null;

create index if not exists inbox_messages_status_idx
  on public.inbox_messages (status, received_at desc);

create index if not exists inbox_messages_deadline_idx
  on public.inbox_messages (response_deadline)
  where status in ('unread', 'drafted');

-- ----------------------------------------------------------------------------
-- TRIGGERS: updated_at
-- ----------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists outbound_drafts_touch on public.outbound_drafts;
create trigger outbound_drafts_touch
  before update on public.outbound_drafts
  for each row execute function public.touch_updated_at();

drop trigger if exists embaixadores_touch on public.embaixadores;
create trigger embaixadores_touch
  before update on public.embaixadores
  for each row execute function public.touch_updated_at();

drop trigger if exists inbox_messages_touch on public.inbox_messages;
create trigger inbox_messages_touch
  before update on public.inbox_messages
  for each row execute function public.touch_updated_at();

-- Trigger pra sincronizar response_deadline = received_at + 24h em insert/update
create or replace function public.inbox_set_response_deadline()
returns trigger language plpgsql as $$
begin
  new.response_deadline = new.received_at + interval '24 hours';
  return new;
end;
$$;

drop trigger if exists inbox_messages_set_deadline on public.inbox_messages;
create trigger inbox_messages_set_deadline
  before insert or update of received_at on public.inbox_messages
  for each row execute function public.inbox_set_response_deadline();
