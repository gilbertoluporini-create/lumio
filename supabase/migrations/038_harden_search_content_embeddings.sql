-- ============================================================================
-- Hardening: search_content_embeddings (mesma fix da 035)
-- ============================================================================
-- A RPC `search_content_embeddings` foi criada em 015_content_embeddings.sql
-- com `grant execute ... to authenticated, service_role`. Mesmo padrão IDOR
-- que a 035 fixou em `search_pdf_extracted_images`:
--
-- Função é `security definer` e aceita `user_id_input` como parâmetro
-- arbitrário. Se chamada por um cliente autenticado, qualquer user poderia
-- passar `user_id_input` de outro user e listar `content` indexado dele
-- (transcripts de lectures, source_text de documentos, slides) — CROSS-USER
-- DATA LEAKAGE P0.
--
-- Mitigação (espelha 035, defesa em profundidade):
--   1. Revoga execute de public/authenticated/anon — client SDK NÃO chama
--      mais essa RPC diretamente.
--   2. Mantém grant pra service_role — backend (chat-summary, lumi-tools
--      via createAdminClient) continua funcionando.
--   3. Guard interno: se user_id_input for null, levanta exception
--      (service_role sempre passa o user_id da sessão autenticada via
--      backend; null = bug).
--
-- Callers auditados (todos via createAdminClient = service_role):
--   - src/app/api/ai/chat-summary/route.ts (RAG no chat de resumo)
--   - src/lib/lumi-tools.ts -> buscar_no_material (Lumi tool)
--   - src/lib/lumi-tools.ts -> rede de segurança (probe matéria errada)
--   - src/lib/lumi-tools.ts -> mapeamento de tópicos do plano
--
-- ⚠️ Assinatura MANTIDA IDÊNTICA à 015 (mesmo nome de params, tipos, defaults
-- e return type). Mudar a assinatura criaria função nova e quebra callers.
-- A única diferença vs 015 é: language sql -> plpgsql (pra permitir o
-- raise exception do guard interno).
-- ============================================================================

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
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  -- Defesa em profundidade: service_role sempre passa user_id_input do user
  -- já autenticado no backend. Nunca null.
  if user_id_input is null then
    raise exception 'search_content_embeddings: user_id_input is required';
  end if;

  return query
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
end;
$$;

-- ⚠️ SEGURANÇA: revoga authenticated/anon/public e mantém só service_role.
-- Idempotente: revoke/grant repetidos não falham.
revoke execute on function public.search_content_embeddings(
  vector(1536), uuid, uuid, text, float, int
) from public;

revoke execute on function public.search_content_embeddings(
  vector(1536), uuid, uuid, text, float, int
) from anon;

revoke execute on function public.search_content_embeddings(
  vector(1536), uuid, uuid, text, float, int
) from authenticated;

grant execute on function public.search_content_embeddings(
  vector(1536), uuid, uuid, text, float, int
) to service_role;
