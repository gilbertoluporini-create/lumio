-- 036_cascade_delete_summaries.sql
--
-- Cascade SOFT-delete: quando user soft-deleta uma lecture/document
-- (UPDATE ... SET deleted_at = NOW()), propaga o mesmo deleted_at pros
-- summaries derivados (FK lecture_id / document_id).
--
-- Bug que isso corrige: summaries órfãos.
--   1) User soft-deleta a lecture (UPDATE lectures SET deleted_at = NOW())
--   2) FK summaries.lecture_id NÃO cascateia (é só HARD-delete cascade)
--   3) Listagem do subject ainda mostra o resumo (summaries.deleted_at IS NULL)
--   4) Clica → /resumo/[lectureId] redireciona pra /lecture/[id]
--   5) /lecture/[id] dá 404 pq lecture-auth bloqueia (lectures.deleted_at != null)
--   6) User fica sem conseguir abrir NEM excluir
--
-- Estratégia: trigger AFTER UPDATE em lectures e documents, SECURITY DEFINER
-- pra atravessar RLS (rodando como owner do schema), search_path travado
-- em public pra evitar hijack.
--
-- Reverse (restore): se OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL,
-- restaura SOMENTE os summaries que foram cascateados juntos — filtro estrito
-- `WHERE deleted_at = OLD.deleted_at` preserva summaries que o user havia
-- deletado manualmente ANTES (timestamp diferente).
--
-- Por que NÃO migrar pra `ON DELETE CASCADE` na FK?
-- → A FK existente já é ON DELETE CASCADE, mas pra HARD-delete. Aqui é
--   soft-delete: o registro continua na tabela, então a FK do Postgres não
--   dispara. Precisamos de trigger.

-- ============================================================================
-- 1) Função de cascade soft-delete pra lectures → summaries
-- ============================================================================
create or replace function public.cascade_soft_delete_lecture_summaries()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Transição NULL → não-null = soft-delete
  if old.deleted_at is null and new.deleted_at is not null then
    update public.summaries
      set deleted_at = new.deleted_at
      where lecture_id = new.id
        and deleted_at is null;

  -- Transição não-null → NULL = restore. Restaura SOMENTE os summaries
  -- cascateados na mesma operação (timestamp bate com OLD.deleted_at).
  -- Se o user havia deletado um summary manualmente ANTES da lecture
  -- (timestamps diferentes), ele permanece deletado — preserva a intenção
  -- original do user.
  elsif old.deleted_at is not null and new.deleted_at is null then
    update public.summaries
      set deleted_at = null
      where lecture_id = new.id
        and deleted_at = old.deleted_at;
  end if;

  return new;
end;
$$;

-- ============================================================================
-- 2) Documents NÃO tem soft-delete
-- ============================================================================
-- Verificado em 2026-06-01: tabela public.documents NÃO tem coluna deleted_at.
-- Documents são hard-deletados (DELETE) e a FK summaries.document_id já tem
-- ON DELETE CASCADE, então não precisa de trigger soft-delete aqui. Se um dia
-- documents ganhar soft-delete, adicionar trigger espelho do de lectures.

-- ============================================================================
-- 3) Trigger (idempotente via DROP IF EXISTS + CREATE)
-- ============================================================================
drop trigger if exists trg_cascade_soft_delete_lecture_summaries on public.lectures;
create trigger trg_cascade_soft_delete_lecture_summaries
  after update of deleted_at on public.lectures
  for each row
  when (old.deleted_at is distinct from new.deleted_at)
  execute function public.cascade_soft_delete_lecture_summaries();

-- ============================================================================
-- 4) Backfill: cura summaries órfãos JÁ existentes em produção
-- ============================================================================
-- Sem isso, o trigger só cobre casos futuros — quem já tem resumos órfãos
-- continua sem conseguir abrir/excluir. Marca como deleted_at = deleted_at
-- da fonte (lecture/document) pra manter histórico consistente.
update public.summaries s
  set deleted_at = l.deleted_at
  from public.lectures l
  where s.lecture_id = l.id
    and l.deleted_at is not null
    and s.deleted_at is null;
