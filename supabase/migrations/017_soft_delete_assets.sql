-- Soft delete pra summaries e lecture_assets.
--
-- Motivação: quando o user deleta um resumo/flashcards/quiz/mapa, o Lumi
-- não tinha como saber que aquilo existiu antes. Agora o user quer que o
-- chat avise "você deletou esse resumo antes — quer regerar?" — então
-- precisamos preservar o histórico mesmo após a deleção visível.
--
-- Estratégia: adicionar deleted_at TIMESTAMPTZ. Quando preenchido, o asset
-- é considerado deletado. As queries de listagem normais filtram
-- deleted_at IS NULL; o Lumi consulta com deleted_at IS NOT NULL pra saber
-- o histórico recente.

ALTER TABLE summaries
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

ALTER TABLE lecture_assets
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Índice pra filtrar rápido nas queries do user (assets vivos)
CREATE INDEX IF NOT EXISTS idx_summaries_user_deleted
  ON summaries (user_id, deleted_at)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_lecture_assets_user_deleted
  ON lecture_assets (user_id, deleted_at)
  WHERE deleted_at IS NULL;

-- Índice pra o Lumi consultar histórico deletado recente (últimos 30d)
CREATE INDEX IF NOT EXISTS idx_summaries_deleted_recent
  ON summaries (user_id, deleted_at DESC)
  WHERE deleted_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_lecture_assets_deleted_recent
  ON lecture_assets (user_id, deleted_at DESC)
  WHERE deleted_at IS NOT NULL;
