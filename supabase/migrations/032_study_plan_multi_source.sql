-- Permite que cada item do plano de estudos tenha MÚLTIPLAS sources
-- (vários PDFs E/OU várias aulas), em vez de só uma. Necessário pra UX
-- de "tópicos" no wizard, onde 1 aula gravada + 1 PDF de slides do prof
-- viram 1 card único com resumo combinado.
--
-- Estratégia: arrays UUID em vez de tabela junction. Pra um app pequeno
-- com poucas fontes por item (~5 max), array é mais simples e a query
-- de "carregar todas as sources do item" vira um UNNEST sem JOIN.
--
-- Compat: campos singulares `source_document_id` e `source_lecture_id`
-- ficam vivos. Worker prefere arrays se não vazios; fallback pros
-- singulares pra não quebrar items criados antes desta migration.

alter table public.study_plan_items
  add column if not exists source_document_ids uuid[] not null default '{}',
  add column if not exists source_lecture_ids uuid[] not null default '{}';

-- Índice GIN pros arrays — útil quando o worker precisar achar items
-- de uma source específica (ex: "qual plano tem esse PDF?").
create index if not exists study_plan_items_source_document_ids_idx
  on public.study_plan_items using gin (source_document_ids);
create index if not exists study_plan_items_source_lecture_ids_idx
  on public.study_plan_items using gin (source_lecture_ids);
