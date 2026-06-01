-- ============================================================================
-- 044_exam_relevance_unique.sql
-- ============================================================================
-- Adiciona unique indexes parciais em `exam_lecture_relevance` pra permitir
-- UPSERT atômico no cron `/api/cron/exam-relevance`.
--
-- Contexto do bug (P1 #3, identificado em code review S6 / 2026-06-01):
--   O cron fazia DELETE prévio + INSERT em lote, não-atômico. Janela curta
--   de "sem badge" entre os 2 statements; se o INSERT falhasse, o user
--   ficava 24h sem dados de Smart Prep até o próximo cron rodar.
--
-- Como a 040 modela "exactly one target" via CHECK constraint (lecture XOR
-- document XOR summary), cada row tem apenas um dos 3 alvos populado. Por
-- isso usamos 3 unique indexes parciais — um por kind de alvo — em vez de
-- um único índice composto que teria que tratar NULLs.
--
-- Após esta migration, o cron pode usar:
--   upsert(rows, { onConflict: 'exam_id,lecture_id' })  -- para kind=lecture
--   ... e idem para document_id / summary_id.
-- ============================================================================

create unique index if not exists exam_lecture_relevance_exam_lecture_uniq
  on public.exam_lecture_relevance (exam_id, lecture_id)
  where lecture_id is not null;

create unique index if not exists exam_lecture_relevance_exam_document_uniq
  on public.exam_lecture_relevance (exam_id, document_id)
  where document_id is not null;

create unique index if not exists exam_lecture_relevance_exam_summary_uniq
  on public.exam_lecture_relevance (exam_id, summary_id)
  where summary_id is not null;
