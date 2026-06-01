-- ============================================================================
-- Migration 045: Security Critical Fixes (Audit 2026-06-01)
-- ============================================================================
-- Consolida 4 fixes de severidade Alta/Crítica identificados no audit:
--
--   1. Bucket `user-documents` estava PUBLIC → qualquer um com a URL lia
--      PDFs de outros usuários (PII em material acadêmico). Vira private.
--      Policies de RLS por pasta (auth.uid()) já existem na migration 030.
--
--   2. Bucket `lectures-audio` estava PUBLIC + tinha policy "public read"
--      pra anon → áudio bruto de aula vazava por URL. Vira private; a
--      policy anon é removida; clients usam createSignedUrl.
--
--   3. Tabela `content_drafts` estava sem RLS ativo → qualquer cliente com
--      anon key listava/editava o pipeline editorial inteiro (drafts,
--      reasoning, métricas internas). Service-role only.
--
--   4. Tabelas `outbound_drafts`, `embaixadores`, `inbox_messages` mesma
--      situação — dados sensíveis de marketing (DMs, contatos, métricas,
--      mensagens privadas do IG). Service-role only.
--
-- Padrão das tabelas admin: cron + admin server-side já usam service_role
-- via SUPABASE_SERVICE_ROLE_KEY; service_role bypassa RLS por padrão, então
-- as policies abaixo são defensive — explicitam que NÃO existe acesso
-- anon/authenticated. Qualquer endpoint que precisar ler dessas tabelas
-- DEVE rodar server-side com service role (nunca client-side com anon).
--
-- Idempotente: usa `if exists` / `drop policy if exists` / `create policy`
-- com nomes determinísticos.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. BUCKET user-documents → PRIVATE
-- ----------------------------------------------------------------------------
-- PDFs acadêmicos do user (PII: nome, conteúdo de prova, anotações). URL
-- pública vazava o conteúdo pra qualquer um. Com private, o client precisa
-- usar createSignedUrl (já suportado pelo Supabase JS), e as policies da
-- migration 030 garantem que só o dono consegue gerar a signed URL.
update storage.buckets
  set public = false
  where id = 'user-documents';

-- ----------------------------------------------------------------------------
-- 2. BUCKET lectures-audio → PRIVATE + remove policy anon
-- ----------------------------------------------------------------------------
-- Áudio bruto de aula contém conteúdo acadêmico/voz do user. Bucket vira
-- private; o client passa a usar createSignedUrl. As policies de owner
-- (migration 001) continuam intactas.
update storage.buckets
  set public = false
  where id = 'lectures-audio';

-- Remove leitura anônima (era o vetor de vazamento — bastava ter a URL).
drop policy if exists "lectures-audio public read" on storage.objects;

-- ----------------------------------------------------------------------------
-- 3. RLS em content_drafts (service-role only)
-- ----------------------------------------------------------------------------
-- Tabela do pipeline editorial do /admin/marketing. Contém reasoning da IA,
-- drafts não publicados, métricas internas. Nunca deve ser acessada por
-- client com anon key.
alter table if exists public.content_drafts enable row level security;

-- Limpa qualquer policy aberta que possa ter sido criada manualmente.
drop policy if exists "Enable read access for all users" on public.content_drafts;
drop policy if exists "Enable insert for authenticated users" on public.content_drafts;
drop policy if exists "Allow anon read" on public.content_drafts;
drop policy if exists "Allow authenticated read" on public.content_drafts;
drop policy if exists "Allow authenticated all" on public.content_drafts;
drop policy if exists "Public read" on public.content_drafts;
drop policy if exists "content_drafts service_role all" on public.content_drafts;

-- Policy explícita: somente service_role tem qualquer acesso. Cron e admin
-- server-side já usam service_role. Clients (anon/authenticated) bloqueados.
create policy "content_drafts service_role all"
  on public.content_drafts
  for all
  to service_role
  using (true)
  with check (true);

-- ----------------------------------------------------------------------------
-- 4a. RLS em outbound_drafts (service-role only)
-- ----------------------------------------------------------------------------
-- DMs draftadas pra outbound — contém handle/email/perfil pesquisado de
-- terceiros (LGPD) + reasoning interno. Nunca client.
alter table if exists public.outbound_drafts enable row level security;

drop policy if exists "Enable read access for all users" on public.outbound_drafts;
drop policy if exists "Enable insert for authenticated users" on public.outbound_drafts;
drop policy if exists "Allow anon read" on public.outbound_drafts;
drop policy if exists "Allow authenticated read" on public.outbound_drafts;
drop policy if exists "Allow authenticated all" on public.outbound_drafts;
drop policy if exists "Public read" on public.outbound_drafts;
drop policy if exists "outbound_drafts service_role all" on public.outbound_drafts;

create policy "outbound_drafts service_role all"
  on public.outbound_drafts
  for all
  to service_role
  using (true)
  with check (true);

-- ----------------------------------------------------------------------------
-- 4b. RLS em embaixadores (service-role only)
-- ----------------------------------------------------------------------------
-- Programa de embaixadores: nome, email, handles, faculdade, cidade, notas
-- privadas. PII direto. Nunca client.
alter table if exists public.embaixadores enable row level security;

drop policy if exists "Enable read access for all users" on public.embaixadores;
drop policy if exists "Enable insert for authenticated users" on public.embaixadores;
drop policy if exists "Allow anon read" on public.embaixadores;
drop policy if exists "Allow authenticated read" on public.embaixadores;
drop policy if exists "Allow authenticated all" on public.embaixadores;
drop policy if exists "Public read" on public.embaixadores;
drop policy if exists "embaixadores service_role all" on public.embaixadores;

create policy "embaixadores service_role all"
  on public.embaixadores
  for all
  to service_role
  using (true)
  with check (true);

-- ----------------------------------------------------------------------------
-- 4c. RLS em inbox_messages (service-role only)
-- ----------------------------------------------------------------------------
-- Mensagens recebidas no IG/FB via webhook — conteúdo privado de terceiros
-- (LGPD). Drafts de resposta também são internos. Nunca client.
alter table if exists public.inbox_messages enable row level security;

drop policy if exists "Enable read access for all users" on public.inbox_messages;
drop policy if exists "Enable insert for authenticated users" on public.inbox_messages;
drop policy if exists "Allow anon read" on public.inbox_messages;
drop policy if exists "Allow authenticated read" on public.inbox_messages;
drop policy if exists "Allow authenticated all" on public.inbox_messages;
drop policy if exists "Public read" on public.inbox_messages;
drop policy if exists "inbox_messages service_role all" on public.inbox_messages;

create policy "inbox_messages service_role all"
  on public.inbox_messages
  for all
  to service_role
  using (true)
  with check (true);

-- ============================================================================
-- IMPACTO
-- ============================================================================
-- Após aplicar:
--   • PDFs em user-documents e áudios em lectures-audio só são acessíveis
--     via signed URL gerada pelo dono (createSignedUrl). URLs públicas
--     antigas param de funcionar — qualquer rota client que use
--     getPublicUrl precisa migrar pra createSignedUrl.
--   • As 4 tabelas (content_drafts, outbound_drafts, embaixadores,
--     inbox_messages) ficam totalmente inacessíveis via supabase client
--     com anon/authenticated key. Endpoints admin/cron continuam funcionando
--     porque usam SUPABASE_SERVICE_ROLE_KEY (bypassa RLS + tem a policy
--     explícita acima como defesa em profundidade).
--   • Qualquer regressão (rota client tentando ler dessas tabelas) vai
--     retornar array vazio / erro de permissão — fail-closed, comportamento
--     desejado.
-- ============================================================================
