-- ============================================================================
-- 043_idor_lockdown.sql
-- ============================================================================
-- Endurece RPCs `security definer` que aceitam user_id arbitrário do client
-- e ainda NÃO tinham revoke explícito de `public`/`authenticated`/`anon`.
--
-- Padrão de bug auditado: função PG declarada `security definer` aceitando
-- `p_user_id uuid` como parâmetro. Em Postgres + Supabase, funções no schema
-- `public` recebem por default `grant execute to public`. Combinado com
-- `security definer`, isso permite que QUALQUER user autenticado chame a RPC
-- passando o UUID de OUTRO user e leia dados que deveriam ser per-user — IDOR.
--
-- Mesma classe de bug que a 038 fechou pra `search_content_embeddings` e a
-- 035 fechou pra `search_pdf_extracted_images`.
--
-- Auditoria 2026-06-01 (Coder Marketing):
--   - search_content_embeddings    → FECHADA na 038 (mantém)
--   - search_pdf_extracted_images  → FECHADA na 035 (mantém)
--   - search_atlas_combined        → FECHADA na 039 (mantém)
--   - ambassador_estimated_commission → FALTA fix (esta migration)
--
-- Demais funções no inventário são trigger-functions sem parâmetro de user
-- (`touch_*`, `set_*`, `cascade_soft_delete_*`, `referral_*_trigger`,
-- `generate_referral_code`, `refresh_referral_stats`) — não expõem IDOR via
-- parâmetro arbitrário.
--
-- ⚠️ NÃO MEXER em migrations já pushadas (015/035/038/039). Esta é additive.
-- ============================================================================


-- ============================================================================
-- ambassador_estimated_commission (origem: 027_ambassador_v2.sql)
-- ============================================================================
-- Risco: `security definer` + `p_user_id uuid` arbitrário, sem revoke.
-- Caller real: src/app/api/referral/mine/route.ts via createAdminClient
-- (service_role), passando `user.id` da sessão autenticada. Backend é o
-- único caller — autenticated SDK não precisa.
--
-- Sem o lockdown, qualquer user logado consegue chamar:
--   supabase.rpc('ambassador_estimated_commission', { p_user_id: '<vítima>' })
-- e descobrir a receita mensal de comissão (em BRL) de outro embaixador —
-- vazamento financeiro de cross-user, P1 (não tão crítico quanto o de
-- transcripts da 038, mas mesma família de bug).
--
-- Mitigação (espelha 038, defesa em profundidade):
--   1. Revoga execute de public/authenticated/anon — client SDK não chama.
--   2. Mantém grant pra service_role — backend (referral/mine) continua OK.
--   3. Guard interno: p_user_id null = exception (service_role sempre passa
--      o user.id da sessão; null indica bug no caller).
--
-- Assinatura MANTIDA IDÊNTICA à 027 (mesmo nome de params, tipos, defaults,
-- return type). Mudar a assinatura cria função nova e quebra o caller.
-- ============================================================================

create or replace function public.ambassador_estimated_commission(
  p_user_id uuid,
  p_month_start date default date_trunc('month', now())::date
)
returns numeric
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  -- Defesa em profundidade: service_role sempre passa p_user_id do user
  -- autenticado no backend. Null indica caller mal escrito — falha alto.
  if p_user_id is null then
    raise exception 'ambassador_estimated_commission: p_user_id is required';
  end if;

  return (
    select coalesce(sum(r.reward_brl), 0)::numeric(10, 2)
    from public.referral_redemptions r
    join public.referral_codes c on c.id = r.referral_code_id
    where r.referrer_user_id = p_user_id
      and r.status = 'paid'
      and r.paid_at >= p_month_start
      and r.paid_at < (p_month_start + interval '1 month')
  );
end;
$$;

-- ⚠️ SEGURANÇA: revoga authenticated/anon/public, mantém só service_role.
-- Idempotente: revoke/grant repetidos não falham.
revoke execute on function public.ambassador_estimated_commission(uuid, date)
  from public;

revoke execute on function public.ambassador_estimated_commission(uuid, date)
  from anon;

revoke execute on function public.ambassador_estimated_commission(uuid, date)
  from authenticated;

grant execute on function public.ambassador_estimated_commission(uuid, date)
  to service_role;

comment on function public.ambassador_estimated_commission is
  'Soma reward_brl das redemptions pagas no mês corrente. Hardened em 043: '
  'só service_role chama (backend valida user.id da sessão antes). Cross-user '
  'IDOR fechado.';
