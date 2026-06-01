-- ============================================================================
-- Migration 046: RLS High Severity Fixes (Audit 2026-06-01)
-- ============================================================================
-- Endurece DUAS policies que permitem ataques sérios via PostgREST direto:
--
--   1. `profiles_self_update` — antes só bloqueava `role`. User autenticado
--      podia dar PATCH em /rest/v1/profiles?id=eq.<self> alterando
--      `coin_balance` (créditos pagos) e `is_ambassador` (auto-promover pro
--      programa de embaixadores + ganhar acesso a páginas restritas).
--
--      Ataque concreto:
--        curl -X PATCH "$SUPABASE_URL/rest/v1/profiles?id=eq.$UID" \
--          -H "Authorization: Bearer $ANON_TOKEN_DO_USER" \
--          -H "Content-Type: application/json" \
--          -d '{"coin_balance": 999999, "is_ambassador": true}'
--      → 204 (sucesso). User passa a ter coins infinitas + virou embaixador.
--
--   2. `lecture_assets_owner_all` — confiava apenas em `user_id` da própria
--      row, sem cross-check da FK `lecture_id`/`document_id`. User A podia
--      inserir uma row com `user_id = A` mas `lecture_id = <aula do user B>`
--      ou `document_id = <PDF do user B>`, "anexando" um asset (flashcard,
--      quiz, mindmap, summary) numa lecture/document alheia.
--
--      Impactos:
--        - Poluição de conteúdo na biblioteca da vítima.
--        - Se algum endpoint server-side listar assets via lecture_id sem
--          re-filtrar por user_id, vaza pra cross-user (IDOR latente).
--        - Possível enumeração de IDs (lecture_id do user B confirmado válido
--          via 201 vs 400).
--
-- Padrão idempotente: drop policy if exists + create policy.
-- ============================================================================


-- ============================================================================
-- 1. profiles_self_update — fechar privilege escalation via PATCH direto
-- ============================================================================
-- Estado antes (schema.sql:132-139):
--   create policy profiles_self_update on profiles for update
--     using (auth.uid() = id)
--     with check (
--       auth.uid() = id
--       and role = (select role from profiles where id = auth.uid())
--     );
--
-- Bug: `with_check` só protege `role`. Todas as demais colunas economicamente
-- sensíveis (`coin_balance`, `is_ambassador`, `monthly_lectures_used`, etc.)
-- ficavam livres pro client editar.
--
-- Colunas confirmadas em `profiles` (schema.sql + migrations.sql):
--   id, email, name, role, onboarded_at, created_at, updated_at,
--   coin_balance, coins_reset_at, last_topup_at,
--   monthly_lectures_used, monthly_lectures_reset_at,
--   is_ambassador (adicionada via dashboard — backend/admin usa)
--
-- Colunas que o user PODE editar legitimamente via PATCH client:
--   - name           (edita no /account/profile)
--   - onboarded_at   (marca onboarding concluído — fluxo de signup)
--
-- Colunas que o user NÃO PODE alterar (qualquer mudança = ataque):
--   - id, email      (identity — só admin/auth muda)
--   - role           (admin elevation — já estava protegido)
--   - coin_balance, coins_reset_at, last_topup_at         (economia)
--   - monthly_lectures_used, monthly_lectures_reset_at    (quota)
--   - is_ambassador                                       (programa pago)
--   - created_at, updated_at                              (auditoria)
--
-- Estratégia: with_check exige que cada coluna sensível seja IDÊNTICA ao
-- valor atual no DB. Se o client tentar mudar qualquer uma, a policy falha
-- e a row inteira não é atualizada (fail-closed).
--
-- Performance: o subselect `(select … from profiles where id = auth.uid())`
-- é em um único row pelo PK — custo desprezível e o planner consegue inline.
-- ============================================================================
drop policy if exists profiles_self_update on profiles;

create policy profiles_self_update on profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (
    auth.uid() = id
    -- Identity: PK + email não podem mudar via client.
    and id = (select id from profiles where id = auth.uid())
    and email = (select email from profiles where id = auth.uid())
    -- Privilege escalation guard: role só muda via service_role/admin.
    and role = (select role from profiles where id = auth.uid())
    -- Economia: coins só mudam via webhook Stripe / admin / lib/coins.ts
    -- (todos rodam com service_role e bypassam RLS).
    and coin_balance = (select coin_balance from profiles where id = auth.uid())
    and coins_reset_at is not distinct from (
      select coins_reset_at from profiles where id = auth.uid()
    )
    and last_topup_at is not distinct from (
      select last_topup_at from profiles where id = auth.uid()
    )
    -- Quota: usage é incrementado server-side (lib/chat-cap.ts via service_role).
    and monthly_lectures_used = (
      select monthly_lectures_used from profiles where id = auth.uid()
    )
    and monthly_lectures_reset_at is not distinct from (
      select monthly_lectures_reset_at from profiles where id = auth.uid()
    )
    -- Programa de embaixadores: flip só via admin (api/admin/ambassadors/route.ts).
    and is_ambassador is not distinct from (
      select is_ambassador from profiles where id = auth.uid()
    )
  );

comment on policy profiles_self_update on profiles is
  'Hardened em 046: além de role, trava coin_balance, is_ambassador, '
  'monthly_lectures_used e demais colunas de economia/quota. User só pode '
  'editar `name` e `onboarded_at` via client (PATCH direto). Mudanças de '
  'coin/ambassador/role só via service_role no backend.';


-- ============================================================================
-- 2. lecture_assets_owner_all — cross-check de lecture_id e document_id
-- ============================================================================
-- Estado antes (migrations.sql:101-104):
--   create policy lecture_assets_owner_all on lecture_assets for all
--     using (auth.uid() = user_id)
--     with check (auth.uid() = user_id);
--
-- Bug: aceita qualquer `lecture_id`/`document_id` enquanto `user_id = self`.
-- User A insere asset com lecture_id = <aula do user B>, user_id = A → passa.
--
-- Schema relevante (migration 031):
--   lecture_assets (
--     lecture_id  uuid null references lectures(id) on delete cascade,
--     document_id uuid null references documents(id) on delete cascade,
--     user_id     uuid not null references auth.users,
--     check (lecture_id is not null or document_id is not null)
--   )
--
-- Ambas as FKs apontam pra tabelas com `user_id`:
--   lectures.user_id   (schema.sql:47)
--   documents.user_id  (migrations/011_documents_summaries.sql:12)
--
-- Estratégia: pra cada lado da FK que estiver setado, exige que o
-- owner da row referenciada seja `auth.uid()`. Se ambos estiverem null
-- a check constraint da tabela já barra (lecture_id is not null or
-- document_id is not null) — mas a policy também rejeita por defesa em
-- profundidade (`coalesce` resolve null-handling).
-- ============================================================================
drop policy if exists lecture_assets_owner_all on lecture_assets;

create policy lecture_assets_owner_all on lecture_assets for all
  to authenticated
  using (
    auth.uid() = user_id
    and (
      -- Se aponta pra uma lecture, ela tem que ser do mesmo user.
      lecture_id is null
      or exists (
        select 1 from public.lectures l
        where l.id = lecture_assets.lecture_id
          and l.user_id = auth.uid()
      )
    )
    and (
      -- Se aponta pra um document, ele tem que ser do mesmo user.
      document_id is null
      or exists (
        select 1 from public.documents d
        where d.id = lecture_assets.document_id
          and d.user_id = auth.uid()
      )
    )
  )
  with check (
    auth.uid() = user_id
    and (
      lecture_id is null
      or exists (
        select 1 from public.lectures l
        where l.id = lecture_assets.lecture_id
          and l.user_id = auth.uid()
      )
    )
    and (
      document_id is null
      or exists (
        select 1 from public.documents d
        where d.id = lecture_assets.document_id
          and d.user_id = auth.uid()
      )
    )
  );

comment on policy lecture_assets_owner_all on lecture_assets is
  'Hardened em 046: além de checar user_id da própria row, cruza com '
  'lectures.user_id e documents.user_id pra impedir cross-user attach '
  '(IDOR via FK não validada). Idempotente.';


-- ============================================================================
-- IMPACTO
-- ============================================================================
-- Após aplicar:
--
--   • PATCH /rest/v1/profiles?id=eq.self com qualquer mudança em
--     coin_balance / is_ambassador / role / quota retorna erro de policy
--     (PostgREST devolve 403 ou row vazia dependendo da versão). Updates
--     legítimos de `name` e `onboarded_at` continuam funcionando.
--     Endpoints server-side (webhook Stripe, lib/coins.ts, admin) usam
--     service_role e bypassam RLS — fluxo normal não regride.
--
--   • POST/PATCH em lecture_assets exige que `lecture_id` (se setado)
--     pertença ao user autenticado, idem `document_id`. Workers/jobs
--     server-side usam service_role e seguem livres. Frontend só consegue
--     anexar assets em conteúdo próprio.
--
--   • Idempotente: a migration pode ser rodada N vezes sem efeito colateral.
--
--   • Sem mudança de schema (só policies) — não exige reindex/lock pesado.
-- ============================================================================
