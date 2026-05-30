-- ============================================================================
-- Migration 028: Plano de Estudos — geração assíncrona em background
-- ============================================================================
-- Estende study_plans + study_plan_items pra suportar wizard que:
--   1. Aceita N PDFs de upload
--   2. Cria N itens × M kinds escolhidos (resumo, flashcards, quiz, mapa)
--   3. Background worker (cron) gera cada item sequencialmente
--
-- Mudanças:
--   - status do item ganha 'generating' e 'failed'
--   - source_document_id: aponta pro PDF que originou esse item (pra worker
--     saber de qual fonte gerar)
--   - error_message: motivo do failed (pra UI mostrar pro user)
--   - asset_kinds em study_plans: lista de kinds que o user marcou no wizard
--     (pra wizard reabrir / regerar plano)
-- ============================================================================

-- 1) Expande check constraint do status de items
alter table public.study_plan_items
  drop constraint if exists study_plan_items_status_check;
alter table public.study_plan_items
  add constraint study_plan_items_status_check
  check (status in ('pending', 'in_progress', 'done', 'generating', 'failed'));

-- 2) source_document_id — FK solta (mantém compat com items legados sem source)
alter table public.study_plan_items
  add column if not exists source_document_id uuid
  references public.documents(id) on delete set null;

-- 3) error_message — mensagem amigável quando geração falha
alter table public.study_plan_items
  add column if not exists error_message text;

-- 4) asset_kinds em study_plans — lista de kinds que o wizard pediu
alter table public.study_plans
  add column if not exists asset_kinds text[] default '{}';

-- 5) Index pro cron worker pegar items pendentes RÁPIDO.
--    Worker pega 1-3 items 'pending' por run via FOR UPDATE SKIP LOCKED.
create index if not exists study_plan_items_pending_for_worker_idx
  on public.study_plan_items (status, created_at)
  where status = 'pending' and source_document_id is not null;
