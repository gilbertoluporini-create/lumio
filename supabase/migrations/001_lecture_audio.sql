-- ============================================================================
-- Migration: gravação de áudio real das aulas
-- ============================================================================
-- Rode no SQL Editor do Supabase. Idempotente — pode rodar várias vezes.
-- ============================================================================

-- 1) Coluna audio_url na tabela lectures
alter table lectures
  add column if not exists audio_url text;

-- ============================================================================
-- 2) Storage bucket "lectures-audio"
-- ============================================================================
-- ⚠️ IMPORTANTE: Buckets NÃO podem ser criados via SQL no Supabase. Crie no
--    Dashboard → Storage → New bucket:
--      • Name: lectures-audio
--      • Public: YES (URLs públicas via getPublicUrl)
--        — alternativa: deixar private e usar createSignedUrl no client.
--
-- As policies abaixo são aplicáveis em qualquer cenário (private ou public);
-- garantem que cada usuário só consegue mexer nos arquivos da própria pasta
-- (path layout: {auth.uid()}/{lectureId}.webm).
-- ============================================================================

-- Drop+create idempotente das policies do bucket
drop policy if exists "lectures-audio owner select" on storage.objects;
create policy "lectures-audio owner select"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'lectures-audio'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "lectures-audio owner insert" on storage.objects;
create policy "lectures-audio owner insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'lectures-audio'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "lectures-audio owner update" on storage.objects;
create policy "lectures-audio owner update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'lectures-audio'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'lectures-audio'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "lectures-audio owner delete" on storage.objects;
create policy "lectures-audio owner delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'lectures-audio'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Se o bucket for PUBLIC, também precisamos liberar leitura anônima:
drop policy if exists "lectures-audio public read" on storage.objects;
create policy "lectures-audio public read"
  on storage.objects for select to anon
  using (bucket_id = 'lectures-audio');
