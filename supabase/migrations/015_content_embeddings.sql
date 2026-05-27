-- Migration 015: RAG infrastructure
-- Habilita pgvector + cria tabela `content_embeddings` que indexa todos os
-- assets de aprendizado (lecture transcripts, document source_text, slides).
--
-- Modelo de embeddings: OpenAI text-embedding-3-small (1536 dims, $0.02/Mtok)
-- Distância: cosine (matching com OpenAI espera dot product mas cosine é stable).

create extension if not exists vector;

create table if not exists public.content_embeddings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  /**
   * Tipo da fonte: 'lecture' | 'document' | 'summary' | 'slide'
   * Permite filtrar busca semântica por origem.
   */
  source_kind text not null,
  /** ID da lecture, document ou summary */
  source_id uuid not null,
  /** Pra filtrar por matéria nas buscas (95% dos queries vão filtrar por isso) */
  subject_id uuid,
  /** Ordem do chunk dentro da fonte (0,1,2,...) */
  chunk_index int not null,
  /** Texto bruto do chunk (~500 palavras = ~2000 chars) */
  content text not null,
  /** Vector 1536 dim do text-embedding-3-small */
  embedding vector(1536) not null,
  /** Metadata flexível: page_number, slide_title, char_start, char_end */
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, source_kind, source_id, chunk_index)
);

-- Índices: pgvector IVFFlat pra busca semântica + B-tree pros filtros
create index if not exists content_embeddings_vector_idx
  on public.content_embeddings using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

create index if not exists content_embeddings_user_subject_idx
  on public.content_embeddings (user_id, subject_id);

create index if not exists content_embeddings_source_idx
  on public.content_embeddings (user_id, source_kind, source_id);

-- RLS: user só lê o que é dele. Writes só via service_role (endpoints API).
alter table public.content_embeddings enable row level security;

drop policy if exists "user reads own embeddings" on public.content_embeddings;
create policy "user reads own embeddings"
  on public.content_embeddings
  for select
  using (auth.uid() = user_id);

-- Sem policies de insert/update/delete → bloqueado pra anon/authenticated;
-- só service_role consegue mexer (que é o endpoint /api/embed).

/**
 * Função de busca semântica.
 * Cliente passa o vector da query + filtros + limit/threshold.
 * Retorna chunks ordenados por similaridade cosseno (1 = idêntico).
 */
create or replace function public.search_content_embeddings(
  query_embedding vector(1536),
  user_id_input uuid,
  subject_id_input uuid default null,
  source_kind_input text default null,
  match_threshold float default 0.3,
  match_count int default 5
)
returns table (
  id uuid,
  source_kind text,
  source_id uuid,
  chunk_index int,
  content text,
  metadata jsonb,
  similarity float
)
language sql
stable
security definer
set search_path = public
as $$
  select
    e.id,
    e.source_kind,
    e.source_id,
    e.chunk_index,
    e.content,
    e.metadata,
    1 - (e.embedding <=> query_embedding) as similarity
  from public.content_embeddings e
  where e.user_id = user_id_input
    and (subject_id_input is null or e.subject_id = subject_id_input)
    and (source_kind_input is null or e.source_kind = source_kind_input)
    and 1 - (e.embedding <=> query_embedding) > match_threshold
  order by e.embedding <=> query_embedding
  limit match_count;
$$;

grant execute on function public.search_content_embeddings to authenticated, service_role;
