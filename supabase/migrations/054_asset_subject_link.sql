-- Reorg da arquitetura de informação: ancorar TODO asset na matéria.
--
-- Problema: lecture_assets (flashcards/quiz/mindmap) não guardava subject_id.
-- A matéria era inferida no cliente atravessando a aula-pai (use-all-documents
-- :280). Quando o elo é frágil (asset de PDF, aula sem subject, matéria de outro
-- semestre) o asset some da matéria certa — "as infos não cruzam".
--
-- Solução: subject_id vira coluna real e persistida em lecture_assets, gravada
-- na criação e backfilled a partir do pai (lecture XOR document). Com isso, o
-- semestre é alcançado SEMPRE via subject (subjects.semester_id, 053) — sem
-- precisar denormalizar semester_id em N tabelas e arriscar dessync.
--
-- Migração aditiva e idempotente: roda em DB populado sem perder nada.

-- 1) subject_id em lecture_assets (nullable; on delete set null mantém o asset
--    vivo se a matéria for apagada, consistente com lectures/documents/summaries).
alter table public.lecture_assets
  add column if not exists subject_id uuid
  references public.subjects(id) on delete set null;

create index if not exists lecture_assets_subject_id_idx
  on public.lecture_assets (user_id, subject_id)
  where deleted_at is null;

-- 2) BACKFILL lecture_assets.subject_id a partir do pai.
--    Preferência: a aula (lecture_id). Senão, o documento (document_id).
update public.lecture_assets la
  set subject_id = l.subject_id
  from public.lectures l
  where la.subject_id is null
    and la.lecture_id = l.id
    and l.subject_id is not null;

update public.lecture_assets la
  set subject_id = d.subject_id
  from public.documents d
  where la.subject_id is null
    and la.document_id = d.id
    and d.subject_id is not null;

-- 3) BACKFILL defensivo de summaries.subject_id (nullable, setado à mão pelo
--    caller — pode ter ficado null em resumos antigos). Recupera do pai.
update public.summaries s
  set subject_id = l.subject_id
  from public.lectures l
  where s.subject_id is null
    and s.lecture_id = l.id
    and l.subject_id is not null;

update public.summaries s
  set subject_id = d.subject_id
  from public.documents d
  where s.subject_id is null
    and s.document_id = d.id
    and d.subject_id is not null;

-- 4) REDE DE SEGURANÇA: trigger que preenche subject_id no insert de
--    lecture_assets a partir do pai (aula > documento). Garante que nenhum
--    insert futuro — de qualquer rota — esqueça de ancorar o asset na matéria.
create or replace function public.lecture_assets_fill_subject()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.subject_id is null then
    if new.lecture_id is not null then
      select subject_id into new.subject_id
        from public.lectures where id = new.lecture_id;
    end if;
    if new.subject_id is null and new.document_id is not null then
      select subject_id into new.subject_id
        from public.documents where id = new.document_id;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists lecture_assets_fill_subject_trg on public.lecture_assets;
create trigger lecture_assets_fill_subject_trg
  before insert on public.lecture_assets
  for each row execute function public.lecture_assets_fill_subject();

