-- 041_lecture_assets_in_documents.sql
--
-- Faz `lecture_assets` (flashcards / quiz / mindmap / summary derivados de
-- aulas e PDFs) virar cidadão de 1ª classe na página /documentos:
--
--  * Já tem `folder_id` desde 027_folders.sql (linha 72-74), mas reforçamos
--    aqui com IF NOT EXISTS pra deixar a migration idempotente caso seja
--    rodada num ambiente que pulou 027 (e os índices ficam alinhados com
--    o pattern usado em documents/lectures/summaries).
--
--  * NOVO: coluna `title text` user-visible. Hoje o título mostrado em
--    /documentos é derivado do lecture/document de origem ("Deck — <aula>"),
--    o que é ok pro default, mas o user não consegue renomear pra algo
--    significativo ("Deck — Suprarrenais Mandic T11"). Com `title` opcional,
--    a UI usa o título customizado quando setado e cai no derivado caso
--    contrário. NULL = "usa fallback derivado do source".
--
--  * NOVO: índice composto `(user_id, folder_id) WHERE deleted_at IS NULL`
--    pra listagem rápida por pasta (padrão atual da página /documentos
--    busca por user_id; quando o user clicar numa pasta, vamos filtrar por
--    folder_id também — esse índice cobre os dois casos).
--
-- RLS: a tabela já tem `lecture_assets_owner_all` (USING + WITH CHECK em
-- auth.uid() = user_id) desde a migration inicial (migrations.sql linha
-- 101-104). Esse policy cobre INSERT/UPDATE/DELETE/SELECT, ou seja, mover
-- entre pastas (UPDATE folder_id) e renomear (UPDATE title) já estão
-- protegidos. Não precisa adicionar nada.

-- 1) Reforço idempotente do folder_id (já criado em 027_folders.sql).
alter table public.lecture_assets
  add column if not exists folder_id uuid
  references public.folders(id) on delete set null;

-- 2) Título user-visible (nullable; UI usa derivado quando NULL).
alter table public.lecture_assets
  add column if not exists title text;

-- 3) Índice composto pra listagem por pasta na /documentos.
--    `deleted_at IS NULL` é o filtro padrão da listagem (assets vivos).
create index if not exists lecture_assets_user_folder_idx
  on public.lecture_assets (user_id, folder_id)
  where deleted_at is null;

-- Sanity: RLS já está habilitada e a policy `lecture_assets_owner_all` já
-- cobre todos os comandos. Reaplicamos o ENABLE só pra garantir caso
-- algum env tenha o RLS desligado.
alter table public.lecture_assets enable row level security;
