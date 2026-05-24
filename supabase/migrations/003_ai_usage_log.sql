-- ============================================================================
-- Migration: ai_usage_log — telemetria de chamadas AI por usuário
-- ============================================================================
-- Cada linha = 1 chamada a um endpoint AI. Usado pra:
--   - calcular custo USD por usuário/mês
--   - cruzar com receita pra ver margem
--   - identificar abusadores ou planos não-rentáveis
-- ============================================================================

create table if not exists public.ai_usage_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  endpoint text not null,                -- ex: 'generate', 'chat-summary', 'imagen3'
  model text not null,                   -- ex: 'claude-sonnet-4-5', 'claude-haiku-4-5', 'imagen-3.0'
  input_tokens int default 0,
  output_tokens int default 0,
  images_count int default 0,
  cost_usd numeric(10,6) not null default 0,
  coins_charged int default 0,
  created_at timestamptz not null default now()
);

create index if not exists ai_usage_log_user_idx on public.ai_usage_log(user_id);
create index if not exists ai_usage_log_created_idx on public.ai_usage_log(created_at desc);

alter table public.ai_usage_log enable row level security;
-- Sem policies: apenas service_role consegue ler/escrever.
