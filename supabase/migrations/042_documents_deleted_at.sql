-- 2026-06-01: adiciona soft-delete em documents pra alinhar com lectures/summaries.
-- Sem essa coluna, listar_aulas_e_docs e buscar_no_material falham silenciosamente
-- (filtros `.is(deleted_at, null)` retornam erro 42703) e o Lumi não enxerga
-- documentos recém-subidos.

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_documents_deleted_at
  ON documents (deleted_at)
  WHERE deleted_at IS NULL;
