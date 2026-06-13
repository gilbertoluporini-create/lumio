-- 050_transcription_retry.sql
-- Suporte a RETRY automático de transcrição travada.
--
-- BUG: transcribe é fire-and-forget; se a função Vercel estoura maxDuration ou
-- crasha entre chunks, a aula fica presa em 'transcribing'/'failed' e o user
-- precisa re-subir o áudio inteiro (reclamação do founder: "perde o progresso").
--
-- Fix: persistir o storage_path do áudio na própria lecture + um cron que
-- re-dispara a transcrição das travadas (bounded por transcription_attempts).

ALTER TABLE public.lectures
  ADD COLUMN IF NOT EXISTS storage_path TEXT,
  ADD COLUMN IF NOT EXISTS transcription_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS transcription_started_at TIMESTAMPTZ;

-- Índice pro cron varrer travadas rápido (status + quando começou).
CREATE INDEX IF NOT EXISTS idx_lectures_transcription_stuck
  ON public.lectures (transcription_status, transcription_started_at)
  WHERE transcription_status IN ('transcribing', 'failed');

COMMENT ON COLUMN public.lectures.storage_path IS
  'Caminho do áudio no bucket lectures (user_id/...), persistido pra retry. Migration 050.';
