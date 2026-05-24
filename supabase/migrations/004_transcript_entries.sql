-- ============================================================================
-- Migration: transcript_entries + transcript_insights
-- ============================================================================
-- Adiciona campos JSONB pra suportar transcrição estruturada (entries com
-- timestamp + speaker + slide sync + marker) e insights derivados (key terms
-- + topics). O campo `transcript` (text) é mantido como fallback/projeção.
--
-- Idempotente — pode rodar várias vezes.
-- ============================================================================

alter table lectures
  add column if not exists transcript_entries jsonb;

alter table lectures
  add column if not exists transcript_insights jsonb;

create index if not exists lectures_transcript_entries_idx
  on lectures using gin (transcript_entries);
