-- ============================================================================
-- Cleanup de Lectures vazias legadas
-- ============================================================================
-- Há lectures criadas pelo wizard antigo de PDF que são "vazias" (sem áudio,
-- sem transcript) mas têm um summary linkado. Semanticamente são resumos de
-- documento, mas aparecem como aulas no dashboard.
--
-- Esta migration:
--   1) Pra cada Lecture vazia COM summary → cria Document + reaponta o summary
--      pro novo Document + deleta a Lecture.
--   2) Pra cada Lecture totalmente vazia (sem summary) → deleta direto.
-- ============================================================================

-- Step 1: converter Lectures vazias com summary → Documents
do $$
declare
  rec record;
  new_doc_id uuid;
begin
  for rec in
    select l.id, l.user_id, l.subject_id, l.title, l.created_at, l.updated_at
    from public.lectures l
    where l.duration_sec = 0
      and coalesce(length(l.transcript), 0) = 0
      and exists (select 1 from public.summaries s where s.lecture_id = l.id)
  loop
    insert into public.documents
      (user_id, subject_id, title, source_kind, created_at, updated_at)
    values
      (rec.user_id, rec.subject_id, rec.title, 'pdf', rec.created_at, rec.updated_at)
    returning id into new_doc_id;

    update public.summaries
    set lecture_id = null, document_id = new_doc_id
    where lecture_id = rec.id;
  end loop;
end $$;

-- Step 2: deletar Lectures totalmente vazias (sem áudio, transcript, summary)
delete from public.lectures
where duration_sec = 0
  and coalesce(length(transcript), 0) = 0
  and not exists (
    select 1 from public.summaries s where s.lecture_id = lectures.id
  );
