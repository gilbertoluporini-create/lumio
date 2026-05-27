-- ============================================================================
-- Drop coluna legacy lectures.summary
-- ============================================================================
-- Pré-requisito: todas as escritas e leituras agora usam a tabela `summaries`.
-- Backfill já foi feito na migration 011. Esta migration encerra a duplicação.
-- ============================================================================

alter table public.lectures drop column if exists summary;
