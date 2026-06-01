-- ============================================================================
-- Atlas Global: dataset basal compartilhado entre TODOS os users
-- ============================================================================
-- Estratégia: pré-ingestar atlas de domínio público / clássicos UMA VEZ
-- (Gray's Anatomy 1918 via Wikimedia, Sobotta v2, Netter 7e — quando user
-- mandar) em um bucket compartilhado `atlas-global`. O resumo educativo
-- cruza embedding da seção com:
--   1. pdf_extracted_images do PRÓPRIO user (per-user via RLS, 034/035)
--   2. atlas_global_images (esta tabela — invisível na UI)
--
-- User NÃO sabe que existe atlas global — UI mostra como "encontramos uma
-- figura próxima ao tópico". Sem botão de upload pra global, sem listagem.
-- Só service_role escreve/lê via RPC.
--
-- Embedding model: OpenAI text-embedding-3-small (1536 dims), mesmo padrão
-- das 015 / 034 pra permitir UNION ALL coerente entre tabelas.
--
-- Migration 035 (search_pdf_extracted_images) fica INTACTA — outros callers
-- podem usar e funciona como fallback se a combined falhar.
--
-- IDEMPOTENTE: usa `create table if not exists`, `create or replace function`,
-- `on conflict do nothing` no bucket. Rodar 2x não falha.
-- ============================================================================

create extension if not exists vector;

-- ============================================================================
-- 1) Tabela `atlas_global_images`
-- ============================================================================
create table if not exists public.atlas_global_images (
  id uuid primary key default gen_random_uuid(),
  /** Slug do livro/atlas (ex: 'grays-1918', 'sobotta-v2', 'netter-7e') */
  book_slug text not null,
  /** Título interno do livro — NÃO exposto na UI */
  book_title text not null,
  /** Página 1-indexed dentro do livro. Nullable: Wikimedia/avulsas sem pg. */
  page_number int,
  /** Path completo no bucket `atlas-global` */
  storage_path text not null,
  /** Caption/legenda — capturada do livro ou da fonte (Wikimedia file desc) */
  caption_text text,
  /** Classificação semântica: 'anatomy' | 'histology' | 'imaging' | 'other' */
  classification text,
  /** Dimensões originais da imagem (px) */
  width int,
  height int,
  /** Vector 1536 dim do text-embedding-3-small sobre caption (ou OCR fallback) */
  embedding vector(1536),
  created_at timestamptz not null default now()
);

-- ============================================================================
-- 2) Índices
-- ============================================================================
-- B-tree pra filtrar por livro (ex: listar só Gray's na manutenção)
create index if not exists atlas_global_images_book_slug_idx
  on public.atlas_global_images (book_slug);

-- IVFFlat pra busca semântica (mesmo padrão de 015 / 034)
create index if not exists atlas_global_images_embedding_idx
  on public.atlas_global_images using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- ============================================================================
-- 3) RLS: enable + ZERO policies (negação total pra anon/authenticated)
-- ============================================================================
-- Só service_role acessa, e mesmo assim NUNCA direto via from atlas_global_images
-- no client SDK — sempre via RPC `search_atlas_combined`. RLS habilitado sem
-- policies = qualquer query do client retorna vazio (bypass exige service_role).
alter table public.atlas_global_images enable row level security;

-- ============================================================================
-- 4) Storage bucket `atlas-global` (privado, dataset compartilhado)
-- ============================================================================
-- Sem policy de storage.objects — só service_role lê/escreve via signed URL
-- gerado server-side. Pra acessar do app, gerar signed URL no backend e
-- devolver pro client (mesmo padrão de pdf-extracted-images, mas sem RLS
-- per-user no path).
insert into storage.buckets (id, name, public)
values ('atlas-global', 'atlas-global', false)
on conflict (id) do nothing;

-- ============================================================================
-- 5) RPC `search_atlas_combined` — UNION user + global
-- ============================================================================
-- !! SEGURANÇA — LER ANTES DE ALTERAR !!
-- Mesma classe de risco da 035: `security definer` + `user_id_input` arbitrário.
-- Mitigação espelha 035/038:
--   1. `grant execute` RESTRITO a service_role (NÃO authenticated/anon).
--   2. Backend (educational-summary/route.ts) chama assertLectureOwnership
--      ANTES de invocar a RPC.
--   3. Guard interno: user_id_input null = exception.
--
-- A parte global é a MESMA pra todo user (dataset compartilhado, sem PII), então
-- não há cross-user leak no UNION da `atlas_global_images`. O risco IDOR existe
-- só no leg de `pdf_extracted_images` — daí o guard e o revoke.
--
-- ⚠️ `image_url` da pdf_extracted_images NÃO é retornado (a coluna existe e é
-- not null no schema atual — 034 — mas a combined só devolve `storage_path` pra
-- normalizar com o atlas global, que não tem image_url cacheado. O backend
-- gera signed URL on-demand pra ambas as origens via service_role).
--
-- Distance ASC (cosine distance, 0 = idêntico). match_threshold default 0.7
-- segue convenção de "cosine_similarity > 0.7" => distance < 0.3.
-- ============================================================================

create or replace function public.search_atlas_combined(
  query_embedding vector(1536),
  user_id_input uuid,
  document_ids_input uuid[],
  match_threshold float default 0.7,
  match_count int default 5
)
returns table (
  id uuid,
  source text,
  document_id uuid,
  book_slug text,
  page_number int,
  storage_path text,
  caption_text text,
  classification text,
  distance float
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  -- Defesa em profundidade: service_role sempre passa user_id_input do user
  -- já validado por assertLectureOwnership no caller. Nunca null.
  if user_id_input is null then
    raise exception 'search_atlas_combined: user_id_input is required';
  end if;

  return query
  (
    -- Leg 1: imagens do PRÓPRIO user (pdf_extracted_images)
    select
      p.id,
      'user'::text                                as source,
      p.document_id                               as document_id,
      null::text                                  as book_slug,
      p.page_number,
      p.storage_path,
      p.caption_text,
      p.classification,
      (p.embedding <=> query_embedding)::float    as distance
    from public.pdf_extracted_images p
    where p.user_id = user_id_input
      and p.embedding is not null
      and (
        document_ids_input is null
        or array_length(document_ids_input, 1) is null
        or p.document_id = any(document_ids_input)
      )
      and (p.embedding <=> query_embedding) < (1 - match_threshold)

    union all

    -- Leg 2: atlas global compartilhado (sem filtro de user)
    select
      g.id,
      'global'::text                              as source,
      null::uuid                                  as document_id,
      g.book_slug,
      g.page_number,
      g.storage_path,
      g.caption_text,
      g.classification,
      (g.embedding <=> query_embedding)::float    as distance
    from public.atlas_global_images g
    where g.embedding is not null
      and (g.embedding <=> query_embedding) < (1 - match_threshold)
  )
  order by distance asc
  limit match_count;
end;
$$;

-- ============================================================================
-- 6) Grants — só service_role
-- ============================================================================
-- Idempotente: revoke/grant repetidos não falham.
revoke execute on function public.search_atlas_combined(
  vector(1536), uuid, uuid[], float, int
) from public;

revoke execute on function public.search_atlas_combined(
  vector(1536), uuid, uuid[], float, int
) from anon;

revoke execute on function public.search_atlas_combined(
  vector(1536), uuid, uuid[], float, int
) from authenticated;

grant execute on function public.search_atlas_combined(
  vector(1536), uuid, uuid[], float, int
) to service_role;
