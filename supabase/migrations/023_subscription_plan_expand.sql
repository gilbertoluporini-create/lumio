-- ============================================================================
-- Migration 023: expande check de subscriptions.plan
-- ============================================================================
-- Bug latente: o check permitia só ('free','pro','annual'), mas o webhook
-- (PLAN_PRICE_TO_NAME) grava também 'starter' e 'power'. Resultado: se alguém
-- assinasse Starter ou Power, o upsert do webhook estourava o constraint, o
-- evento falhava e a assinatura se perdia (ficava free). Hoje não apareceu
-- porque só havia Pro.
--
-- Dropa qualquer check existente sobre `plan` (sem depender do nome exato) e
-- recria com o set completo de planos que o webhook pode produzir.
-- ============================================================================

do $$
declare
  c record;
begin
  for c in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'subscriptions'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%plan%'
  loop
    execute format('alter table public.subscriptions drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.subscriptions
  add constraint subscriptions_plan_check
  check (plan in ('free', 'starter', 'pro', 'power', 'annual'));
