-- 031_lecture_assets_documents.sql
--
-- Permite que a tabela `lecture_assets` armazene assets gerados a partir de
-- DOCUMENTOS (PDFs) — não só de aulas gravadas. Necessário pra Plano de
-- Estudos: cada item pode ter source_document_id ou source_lecture_id, e
-- flashcards/quiz/mindmap gerados ficam vinculados à fonte correta.
--
-- Antes desta migration, lecture_assets exigia lecture_id (NOT NULL). PDFs
-- não tinham onde guardar assets gerados pelo worker do study plan.

-- 1) Permite lecture_id NULL.
alter table public.lecture_assets
  alter column lecture_id drop not null;

-- 2) Adiciona document_id nullable referenciando documents.
alter table public.lecture_assets
  add column if not exists document_id uuid
  references public.documents(id) on delete cascade;

-- 3) Garante que sempre tem pelo menos uma fonte (lecture OU document).
alter table public.lecture_assets
  drop constraint if exists lecture_assets_source_check;
alter table public.lecture_assets
  add constraint lecture_assets_source_check
  check (lecture_id is not null or document_id is not null);

-- 4) Index pra lookups por document_id.
create index if not exists lecture_assets_document_id_idx
  on public.lecture_assets (document_id)
  where document_id is not null;
