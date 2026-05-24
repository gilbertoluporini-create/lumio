-- ============================================================================
-- Migration: leads — central de leads (pessoas interessadas pre-conversao)
-- ============================================================================
-- Cada linha = 1 lead capturado via:
--   - formulario publico da landing (source=form-landing)
--   - email pro suporte (source=mailto-suporte)
--   - waitlist (source=waitlist)
--   - admin manual (source=manual)
--
-- Idempotente em email (unique). Soft-status via coluna status, nao DELETE.
-- ============================================================================

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  name text,
  email text not null,
  phone text,
  source text not null default 'unknown',
  status text not null default 'new',
  score int default 0,
  notes text,
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(email)
);

create index if not exists leads_status_idx on public.leads(status);
create index if not exists leads_source_idx on public.leads(source);
create index if not exists leads_created_idx on public.leads(created_at desc);

alter table public.leads enable row level security;
-- Sem policies: apenas service_role acessa via /api/admin/leads* e /api/leads.

-- Trigger pra updated_at automatico
create or replace function public.leads_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists leads_updated_at_trg on public.leads;
create trigger leads_updated_at_trg
  before update on public.leads
  for each row
  execute function public.leads_set_updated_at();
