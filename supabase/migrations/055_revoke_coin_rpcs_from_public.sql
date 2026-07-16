-- 055_revoke_coin_rpcs_from_public.sql
-- FECHA BURACO DE PRIVILÉGIO das RPCs de coins criadas em 049_atomic_coins.sql.
--
-- BUG: public.debit_coins, public.credit_coins e public.set_coins_for_renewal são
-- SECURITY DEFINER (rodam com o dono da função, que pode escrever em profiles/
-- coin_transactions). No Postgres, funções nascem com EXECUTE concedido a PUBLIC
-- por padrão. A 049 só fez GRANT EXECUTE ... TO service_role, MAS nunca revogou o
-- PUBLIC → qualquer usuário autenticado (role authenticated/anon) podia chamar
-- credit_coins(seu_id, 999999, ...) via PostgREST e se creditar coins de graça.
--
-- FIX: revogar EXECUTE de PUBLIC/anon/authenticated e reafirmar que só service_role
-- executa. O app SEMPRE chama essas RPCs pelo cliente service_role (server-side),
-- então NADA quebra para o usuário final.
--
-- Idempotente: REVOKE/GRANT são declarativos (podem rodar N vezes). Assinaturas
-- EXATAS das funções de 049 (sobrecarga é resolvida por assinatura).

-- debit_coins(UUID, INTEGER, TEXT, JSONB)
REVOKE ALL ON FUNCTION public.debit_coins(UUID, INTEGER, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.debit_coins(UUID, INTEGER, TEXT, JSONB) TO service_role;

-- credit_coins(UUID, INTEGER, TEXT, JSONB)
REVOKE ALL ON FUNCTION public.credit_coins(UUID, INTEGER, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.credit_coins(UUID, INTEGER, TEXT, JSONB) TO service_role;

-- set_coins_for_renewal(UUID, INTEGER, JSONB)
REVOKE ALL ON FUNCTION public.set_coins_for_renewal(UUID, INTEGER, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_coins_for_renewal(UUID, INTEGER, JSONB) TO service_role;
