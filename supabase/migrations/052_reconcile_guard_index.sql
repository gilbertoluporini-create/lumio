-- 052_reconcile_guard_index.sql
-- Índice funcional pro guard de double-refund do cron reconcile-charges.
--
-- Contexto: o cron /api/cron/reconcile-charges, antes de reembolsar um débito
-- de resumo educativo perdido no crash, checa se aquele débito JÁ foi
-- reembolsado — correlacionando 1:1 por `metadata->>'original_tx' = <id do
-- débito>` entre as transações `reason='refund'`. Esse guard é a ÚNICA
-- proteção contra double-refund (refunds não têm unique constraint).
--
-- Problema: `metadata->>'original_tx'` é extração JSON, NÃO coberta por índice
-- btree comum. Sem índice funcional, o Postgres varre todas as rows
-- `reason='refund'` para CADA débito do batch (até 50/run). Com a tabela
-- crescendo, vira N seq scans por execução, sob maxDuration=60.
--
-- Fix: índice funcional parcial sobre a expressão JSON, restrito a refunds.
-- Torna a correlação O(log n).

CREATE INDEX IF NOT EXISTS idx_coin_tx_refund_original_tx
  ON public.coin_transactions ((metadata ->> 'original_tx'))
  WHERE reason = 'refund';
