-- ============================================================================
-- Migration 024: tabela notifications (sininho do header)
-- ============================================================================
-- Notificações in-app por usuário. Source-agnóstica: hoje é alimentada por
-- tickets de suporte (novo ticket → notifica admin; resposta do admin →
-- notifica autor do ticket). Pode ser estendida pra outros eventos depois.
--
-- Idempotente — pode rodar várias vezes.
-- ============================================================================

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,                 -- 'ticket_new' | 'ticket_reply' | ...
  title text not null,
  body text,
  href text,                          -- destino do click (ex: /admin/tickets, /help)
  metadata jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_created_idx
  on public.notifications(user_id, created_at desc);

create index if not exists notifications_user_unread_idx
  on public.notifications(user_id)
  where read_at is null;

-- RLS
alter table public.notifications enable row level security;

-- Leitura: cada user só vê o que é dele
drop policy if exists "users read own notifications" on public.notifications;
create policy "users read own notifications" on public.notifications
  for select to authenticated
  using (auth.uid() = user_id);

-- Update: cada user só atualiza o próprio (mark read)
drop policy if exists "users update own notifications" on public.notifications;
create policy "users update own notifications" on public.notifications
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Delete: cada user pode limpar as próprias
drop policy if exists "users delete own notifications" on public.notifications;
create policy "users delete own notifications" on public.notifications
  for delete to authenticated
  using (auth.uid() = user_id);

-- Inserts SOMENTE via service-role (rotas server-side), nunca direto do client.
-- Nenhuma policy de insert pra `authenticated` é criada de propósito.
