-- ============================================================================
-- Migration 029: Plano de Estudos — aceita aulas (lectures) como fonte
-- ============================================================================
-- Wizard agora deixa o user escolher PDFs (documents) OU aulas gravadas
-- (lectures) como fonte. Cada study_plan_item pode ter UMA das duas
-- FKs preenchida (ou nenhuma pra items legados/manuais).
--
-- Cron worker passa a usar lecture.transcript como source_text quando
-- source_lecture_id estiver preenchido.
-- ============================================================================

alter table public.study_plan_items
  add column if not exists source_lecture_id uuid
  references public.lectures(id) on delete set null;

-- Ajusta index parcial do cron worker pra incluir lectures
drop index if exists study_plan_items_pending_for_worker_idx;
create index if not exists study_plan_items_pending_for_worker_idx
  on public.study_plan_items (status, created_at)
  where status = 'pending'
    and (source_document_id is not null or source_lecture_id is not null);
