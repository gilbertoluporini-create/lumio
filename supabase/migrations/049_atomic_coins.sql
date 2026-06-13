-- 049_atomic_coins.sql
-- Débito/crédito de coins ATÔMICO via RPC.
--
-- BUG corrigido: chargeCoins/creditCoins faziam read-then-conditional-update
-- (`update ... where coin_balance = <saldo_lido>`). PostgREST NÃO retorna erro
-- quando 0 linhas casam, então em concorrência (2 cliques em "gerar resumo")
-- ambas as requests liam o mesmo saldo, a 1ª debitava, a 2ª "sucedia" sem
-- debitar → 2 gerações pagas (custo real de API) por 1 débito = de graça.
--
-- Fix: UPDATE ... WHERE coin_balance >= amount RETURNING — atômico no nível da
-- linha (Postgres trava a row no update), impossível debitar abaixo do saldo.

-- DÉBITO atômico. Retorna ok=false + saldo atual se insuficiente/inexistente.
CREATE OR REPLACE FUNCTION public.debit_coins(
  p_user_id  UUID,
  p_amount   INTEGER,
  p_reason   TEXT,
  p_metadata JSONB DEFAULT NULL
)
RETURNS TABLE(ok BOOLEAN, balance_after INTEGER, tx_id UUID, current_balance INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new INTEGER;
  v_tx  UUID;
  v_cur INTEGER;
BEGIN
  IF p_amount <= 0 THEN
    SELECT coin_balance INTO v_cur FROM profiles WHERE id = p_user_id;
    RETURN QUERY SELECT TRUE, COALESCE(v_cur, 0), NULL::UUID, COALESCE(v_cur, 0);
    RETURN;
  END IF;

  UPDATE profiles
     SET coin_balance = coin_balance - p_amount
   WHERE id = p_user_id
     AND coin_balance >= p_amount
  RETURNING coin_balance INTO v_new;

  IF NOT FOUND THEN
    -- saldo insuficiente OU usuário inexistente
    SELECT coin_balance INTO v_cur FROM profiles WHERE id = p_user_id;
    RETURN QUERY SELECT FALSE, NULL::INTEGER, NULL::UUID, COALESCE(v_cur, 0);
    RETURN;
  END IF;

  INSERT INTO coin_transactions(user_id, amount, reason, balance_after, metadata)
  VALUES (p_user_id, -p_amount, p_reason, v_new, p_metadata)
  RETURNING id INTO v_tx;

  RETURN QUERY SELECT TRUE, v_new, v_tx, v_new;
END;
$$;

-- CRÉDITO atômico (refund/bônus/renovação incremental). Sem piso.
CREATE OR REPLACE FUNCTION public.credit_coins(
  p_user_id  UUID,
  p_amount   INTEGER,
  p_reason   TEXT,
  p_metadata JSONB DEFAULT NULL
)
RETURNS TABLE(balance_after INTEGER, tx_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new INTEGER;
  v_tx  UUID;
BEGIN
  IF p_amount <= 0 THEN
    SELECT coin_balance INTO v_new FROM profiles WHERE id = p_user_id;
    RETURN QUERY SELECT COALESCE(v_new, 0), NULL::UUID;
    RETURN;
  END IF;

  UPDATE profiles
     SET coin_balance = coin_balance + p_amount
   WHERE id = p_user_id
  RETURNING coin_balance INTO v_new;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'user_not_found';
  END IF;

  INSERT INTO coin_transactions(user_id, amount, reason, balance_after, metadata)
  VALUES (p_user_id, p_amount, p_reason, v_new, p_metadata)
  RETURNING id INTO v_tx;

  RETURN QUERY SELECT v_new, v_tx;
END;
$$;

-- RENOVAÇÃO: set absoluto atômico (loga delta). Isola de débitos concorrentes
-- (a leitura do prev e o update acontecem na mesma transação da função).
CREATE OR REPLACE FUNCTION public.set_coins_for_renewal(
  p_user_id     UUID,
  p_new_balance INTEGER,
  p_metadata    JSONB DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prev  INTEGER;
BEGIN
  -- trava a row e lê o saldo anterior; update na mesma transação = atômico
  SELECT coin_balance INTO v_prev FROM profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'user_not_found';
  END IF;

  UPDATE profiles
     SET coin_balance = p_new_balance,
         coins_reset_at = NOW()
   WHERE id = p_user_id;

  INSERT INTO coin_transactions(user_id, amount, reason, balance_after, metadata)
  VALUES (p_user_id, p_new_balance - COALESCE(v_prev, 0), 'subscription_renew', p_new_balance, p_metadata);

  RETURN p_new_balance;
END;
$$;

GRANT EXECUTE ON FUNCTION public.debit_coins(UUID, INTEGER, TEXT, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.credit_coins(UUID, INTEGER, TEXT, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_coins_for_renewal(UUID, INTEGER, JSONB) TO service_role;

COMMENT ON FUNCTION public.debit_coins IS 'Débito atômico de coins (UPDATE WHERE balance>=amount RETURNING). Ver migration 049.';
