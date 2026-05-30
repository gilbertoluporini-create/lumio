-- 030_user_documents_storage_rls.sql
--
-- Habilita usuários autenticados a fazer upload/leitura/delete de PDFs
-- na sua própria pasta dentro do bucket `user-documents`.
--
-- Layout: cada PDF fica em `{user_id}/{document_id}.pdf`. A primeira pasta
-- do path tem que bater com o auth.uid() — isso garante isolamento.
--
-- Antes dessa migration, o bucket tinha RLS ativo mas SEM policies para
-- authenticated → todo upload do client falhava silenciosamente com 403
-- (somente service_role conseguia, e o client não usa service_role).

-- INSERT: autenticado sobe na própria pasta.
drop policy if exists "Users upload own PDFs" on storage.objects;
create policy "Users upload own PDFs"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'user-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- UPDATE: autenticado pode dar upsert no próprio arquivo (o client usa upsert: true).
drop policy if exists "Users update own PDFs" on storage.objects;
create policy "Users update own PDFs"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'user-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- SELECT: autenticado pode listar/ler os próprios.
-- (Bucket já é public então URL pública funciona, mas listing API requer policy.)
drop policy if exists "Users read own PDFs" on storage.objects;
create policy "Users read own PDFs"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'user-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- DELETE: pra um futuro botão "excluir arquivo do storage".
drop policy if exists "Users delete own PDFs" on storage.objects;
create policy "Users delete own PDFs"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'user-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
