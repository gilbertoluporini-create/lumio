-- ============================================================================
-- Atlas: imagens extraídas de PDFs (Netter, Sobotta, slides do prof)
-- ============================================================================
-- Pipeline: user sobe PDF -> worker extrai imagens página a página -> salva
-- no bucket `pdf-extracted-images` + cria row aqui com embedding da caption.
--
-- Uso no resumo educativo: cruza embedding da seção (transcrição/sumário) com
-- estas imagens via cosine similarity pra trazer figura REAL ao invés de IA.
--
-- Embedding model: OpenAI text-embedding-3-small (1536 dims), mesmo padrão
-- da 015_content_embeddings.sql.
-- ============================================================================

create extension if not exists vector;

-- 1) Tabela principal
create table if not exists public.pdf_extracted_images (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  /** Documento (PDF) de origem. Ver 011_documents_summaries.sql */
  document_id uuid not null references public.documents(id) on delete cascade,
  /** Página 1-indexed dentro do PDF */
  page_number int not null,
  /** Path completo no bucket `pdf-extracted-images` (ex: `{user_id}/{document_id}/p3-i1.png`) */
  storage_path text not null,
  /** URL pública/assinada gerada pelo worker (cache pra evitar re-sign toda hora) */
  image_url text not null,
  /** Caption/legenda capturada do PDF — nullable: nem todo PDF tem legenda clara */
  caption_text text,
  /**
   * Classificação semântica do conteúdo da imagem.
   * Valores esperados: 'histology' | 'anatomy' | 'radiology' | 'diagram' | 'other'.
   * Nullable inicialmente: classifier roda async depois do extract.
   */
  classification text,
  /** Vector 1536 dim do text-embedding-3-small sobre a caption (ou OCR fallback) */
  embedding vector(1536),
  /** Dimensões originais da imagem extraída (px) */
  width int,
  height int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2) Índices
-- B-tree pros filtros mais comuns (listar imagens do user / do documento)
create index if not exists pdf_extracted_images_user_id_idx
  on public.pdf_extracted_images (user_id);

create index if not exists pdf_extracted_images_document_id_idx
  on public.pdf_extracted_images (document_id);

-- IVFFlat pra busca semântica por similaridade (mesmo padrão da 015)
create index if not exists pdf_extracted_images_embedding_idx
  on public.pdf_extracted_images using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- 3) Trigger updated_at (reusa função genérica de 018_marketing_outbound.sql)
drop trigger if exists pdf_extracted_images_touch on public.pdf_extracted_images;
create trigger pdf_extracted_images_touch before update on public.pdf_extracted_images
  for each row execute function public.touch_updated_at();

-- 4) RLS: user só vê/mexe nas próprias rows
alter table public.pdf_extracted_images enable row level security;

drop policy if exists pdf_extracted_images_owner_all on public.pdf_extracted_images;
create policy pdf_extracted_images_owner_all on public.pdf_extracted_images
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================================
-- 5) Storage bucket `pdf-extracted-images` (privado)
-- ============================================================================
-- Layout: `{user_id}/{document_id}/p{page}-i{index}.png`. Primeira pasta tem
-- que bater com auth.uid() — mesmo padrão de 030_user_documents_storage_rls.sql.
-- Bucket privado: leitura via signed URL gerada server-side.
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('pdf-extracted-images', 'pdf-extracted-images', false)
on conflict (id) do nothing;

-- INSERT: autenticado sobe na própria pasta.
drop policy if exists "Users upload own extracted images" on storage.objects;
create policy "Users upload own extracted images"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'pdf-extracted-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- UPDATE: upsert no próprio arquivo (worker pode reprocessar).
drop policy if exists "Users update own extracted images" on storage.objects;
create policy "Users update own extracted images"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'pdf-extracted-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- SELECT: autenticado lista/lê as próprias.
drop policy if exists "Users read own extracted images" on storage.objects;
create policy "Users read own extracted images"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'pdf-extracted-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- DELETE: user pode apagar (cascata quando deletar o documento).
drop policy if exists "Users delete own extracted images" on storage.objects;
create policy "Users delete own extracted images"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'pdf-extracted-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
