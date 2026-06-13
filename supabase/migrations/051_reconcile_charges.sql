-- 051_reconcile_charges.sql
-- Marcador de reconciliação pra o cron de crash-refund.
--
-- Problema: resumo educativo cobra 40-65 coins ANTES do Sonnet (input grande de
-- aula 1h30 + cross-PDFs + atlas). Se a função Vercel é morta por timeout
-- (maxDuration) DURANTE a geração, o processo morre FORA do try/catch → o
-- creditCoins(refund) nunca roda. User paga e fica sem resumo nem reembolso.
--
-- Fix: cron /api/cron/reconcile-charges varre débitos de resumo educativo
-- antigos e, se a aula NÃO tem summary_educational salvo (claramente perdido),
-- devolve os coins. reconciled_at evita reprocessar/double-refund.

ALTER TABLE public.coin_transactions
  ADD COLUMN IF NOT EXISTS reconciled_at TIMESTAMPTZ;

-- Índice pro cron achar débitos não reconciliados rápido.
CREATE INDEX IF NOT EXISTS idx_coin_tx_unreconciled
  ON public.coin_transactions (reason, created_at)
  WHERE reconciled_at IS NULL AND amount < 0;

COMMENT ON COLUMN public.coin_transactions.reconciled_at IS
  'Quando o cron de crash-refund processou este débito (refund ou confirmado ok). Migration 051.';
