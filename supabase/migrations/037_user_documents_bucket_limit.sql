-- 037_user_documents_bucket_limit.sql
--
-- Sobe o file_size_limit do bucket `user-documents` de 50 MB para 300 MB.
--
-- WHY: feature Atlas (em prod desde 2026-06-01) extrai imagens reais de PDFs
-- de atlas anatômicos pra cruzar com transcrições de aulas. Atlas reais
-- (Sobotta vol 2 ~280 MB, Netter ~250 MB) passam fácil de 50 MB e estavam
-- sendo bloqueados no upload — inviabilizando o use case principal da
-- feature.
--
-- O bucket foi criado fora das migrations (provavelmente via dashboard, antes
-- de 030_user_documents_storage_rls.sql consolidar as policies). Por isso o
-- update é condicional ao bucket existir — em ambiente novo onde o bucket
-- ainda não existe, a migration é no-op e quem cria o bucket depois deve
-- setar 314572800 manualmente.
--
-- IDEMPOTENTE: rodar 2x não falha (update simples, sem constraint nova).
--
-- NÃO TOCA EM POLICIES/RLS — já configuradas em 030.

-- 300 MB = 300 * 1024 * 1024 = 314572800 bytes
update storage.buckets
   set file_size_limit = 314572800
 where id = 'user-documents';

-- NOTA OPERACIONAL: alguns ambientes Supabase managed bloqueiam direct UPDATE
-- em storage.buckets via SQL (depende da role do migrator). Se essa migration
-- der erro de permissão em produção, aplicar o mesmo limite via
-- Supabase Dashboard → Storage → user-documents → Settings → File size limit
-- (300 MB).
