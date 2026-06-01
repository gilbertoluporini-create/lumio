-- ============================================================================
-- Atlas: RPC de busca semântica em pdf_extracted_images
-- ============================================================================
-- Espelha 015_content_embeddings.sql / search_content_embeddings, mas escopada
-- na tabela pdf_extracted_images (criada em 034_pdf_extracted_images.sql).
--
-- Uso: endpoint /api/lectures/[id]/educational-summary (modo Atlas).
-- Pra cada seção H2 do resumo, embeda o texto e chama esta RPC pra achar a
-- figura REAL mais próxima dos PDFs do user da mesma matéria.
--
-- Filtros:
--   - user_id_input (obrigatório, scope de segurança)
--   - document_ids_input (array de uuid, opcional — filtra por PDFs da matéria)
--   - classification_input (opcional — restringe a 'anatomy' / 'histology' etc)
--
-- Threshold padrão 0.78 (cosine_similarity > 0.78 = distance < 0.22).
-- Mesma escala da 015 (similarity em [0,1], 1 = idêntico).
--
-- ============================================================================
-- !! SEGURANÇA — LER ANTES DE ALTERAR !!
-- ============================================================================
-- Esta função é `security definer` e ACEITA `user_id_input` como parâmetro
-- arbitrário. Se chamada por um cliente autenticado, qualquer user poderia
-- passar `user_id_input` de outro user e listar `image_url` (signed URL 24h)
-- + caption_text dele — CROSS-USER DATA LEAKAGE P0.
--
-- Mitigação (defesa em profundidade):
--   1. `grant execute` está RESTRITO a `service_role` (NÃO authenticated).
--      Client SDK não consegue chamar essa RPC diretamente — só o backend.
--   2. O backend (educational-summary/route.ts) chama `assertLectureOwnership`
--      ANTES da RPC, garantindo que `userId` (passado como user_id_input) é
--      sempre o do user da request autenticada.
--   3. Guard interno: se `user_id_input` for null, levanta exception
--      (service_role precisa passar explicitamente, defense-in-depth).
--
-- Se alguém um dia precisar expor essa RPC pro client (não recomendado), a
-- correção certa é REMOVER `user_id_input` da assinatura e filtrar via
-- `auth.uid()` diretamente — mas hoje isso quebra o caller atual (que roda
-- com service_role, onde auth.uid() = null).
-- ============================================================================

create or replace function public.search_pdf_extracted_images(
  query_embedding vector(1536),
  user_id_input uuid,
  document_ids_input uuid[] default null,
  classification_input text default null,
  match_threshold float default 0.78,
  match_count int default 3
)
returns table (
  id uuid,
  document_id uuid,
  page_number int,
  image_url text,
  caption_text text,
  classification text,
  similarity float
)
language plpgsql
stable
security definer
set search_path = public
-- ivfflat.probes: o ideal seria probes=10 pra recall melhor, mas Supabase
-- managed bloqueia SET ivfflat.probes em function/role nível ("permission
-- denied to set parameter"). Fica no default (probes=1) que é OK até ~10k
-- imagens. Pra escalar: pedir suporte Supabase pra subir o default ou usar
-- HNSW index (não-disponível em pgvector < 0.5).
as $$
begin
  -- Defesa em profundidade: service_role sempre passa user_id_input do user
  -- já validado por assertLectureOwnership no caller. Nunca null.
  if user_id_input is null then
    raise exception 'search_pdf_extracted_images: user_id_input is required';
  end if;

  return query
  select
    p.id,
    p.document_id,
    p.page_number,
    p.image_url,
    p.caption_text,
    p.classification,
    1 - (p.embedding <=> query_embedding) as similarity
  from public.pdf_extracted_images p
  where p.user_id = user_id_input
    and p.embedding is not null
    and (document_ids_input is null or p.document_id = any(document_ids_input))
    and (classification_input is null or p.classification = classification_input)
    and 1 - (p.embedding <=> query_embedding) > match_threshold
  order by p.embedding <=> query_embedding
  limit match_count;
end;
$$;

-- ⚠️ SEGURANÇA: revoga authenticated e mantém só service_role.
-- Client SDK NÃO pode chamar essa RPC — só o backend (que valida ownership
-- antes via assertLectureOwnership). Vide bloco de segurança acima.
revoke execute on function public.search_pdf_extracted_images(
  vector(1536), uuid, uuid[], text, float, int
) from authenticated;

revoke execute on function public.search_pdf_extracted_images(
  vector(1536), uuid, uuid[], text, float, int
) from public;

grant execute on function public.search_pdf_extracted_images(
  vector(1536), uuid, uuid[], text, float, int
) to service_role;
