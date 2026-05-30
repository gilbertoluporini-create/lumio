-- ============================================================================
-- Migration 025: campos pra upload de áudio + transcrição server-side
-- ============================================================================
-- Adiciona em lectures:
--   * source                 — 'live' (web speech) | 'upload' (arquivo)
--   * transcription_status   — 'pending' | 'transcribing' | 'completed' | 'failed'
--   * transcription_error    — mensagem amigável quando falha
--   * transcription_progress — int 0..100 (opcional, pra UX progressiva)
--
-- Defaults preservam comportamento atual: lectures antigas/live ficam com
-- source='live' e transcription_status='completed' (nenhum reprocessamento).
-- ============================================================================

alter table public.lectures
  add column if not exists source text not null default 'live';

alter table public.lectures
  add column if not exists transcription_status text not null default 'completed';

alter table public.lectures
  add column if not exists transcription_error text;

alter table public.lectures
  add column if not exists transcription_progress integer not null default 100;

-- Garante consistência: valores fora do enum viram 'completed'/'live'.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'lectures_source_chk'
  ) then
    alter table public.lectures
      add constraint lectures_source_chk
      check (source in ('live', 'upload'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'lectures_transcription_status_chk'
  ) then
    alter table public.lectures
      add constraint lectures_transcription_status_chk
      check (transcription_status in ('pending', 'transcribing', 'completed', 'failed'));
  end if;
end $$;

create index if not exists lectures_transcription_status_idx
  on public.lectures(transcription_status)
  where transcription_status in ('pending', 'transcribing');
