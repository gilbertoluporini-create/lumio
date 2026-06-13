-- ============================================================================
-- RUNBOOK DE DEPLOY — branch finalize-app-2026-06
-- ============================================================================
-- Rodar UMA ÚNICA VEZ, LOGO APÓS o deploy do branch entrar no ar (código novo
-- do educational-summary já servindo em produção).
--
-- POR QUÊ: o guard de double-refund do cron reconcile-charges correlaciona por
-- `metadata->>'original_tx'`. Refunds in-handler emitidos pela versão ANTIGA do
-- educational-summary (antes deste deploy) NÃO têm esse campo, então o guard
-- não os reconhece. Como o cron varre débitos de 30min a 48h atrás, existe uma
-- janela de ≤48h pós-deploy em que um débito EDU já reembolsado in-handler na
-- versão antiga poderia ser reembolsado DE NOVO pelo cron.
--
-- (Não é regressão: o cron é novo, antes não havia proteção alguma. Isto só
--  fecha a janela de transição de forma limpa e sem ambiguidade.)
--
-- O QUE FAZ: carimba reconciled_at em TODOS os débitos EDU que existem no
-- momento da execução. Assim o cron passa a agir só em débitos criados DEPOIS
-- do deploy — todos com original_tx no refund in-handler → correlação exata.
--
-- TRADE-OFF (aceitável): débitos EDU pré-deploy genuinamente perdidos no crash
-- (pagos, sem resumo, sem refund) deixam de ser auto-reembolsados pelo cron.
-- Mas o cron NUNCA rodou em produção antes deste deploy, então esses casos
-- nunca seriam auto-reembolsados de qualquer jeito — zero perda vs. status quo.
--
-- ORDEM: deploy → confirmar código novo no ar → rodar este UPDATE.
-- (Rodar DEPOIS do deploy garante que todo débito da versão antiga já existe e
--  é carimbado; débitos novos têm original_tx e são tratados normalmente.)
-- ============================================================================

UPDATE public.coin_transactions
SET reconciled_at = now()
WHERE reason IN (
        'summary_educational',
        'summary_educational_cross',
        'summary_atlas'
      )
  AND amount < 0
  AND reconciled_at IS NULL;

-- Confirmação (deve retornar 0 débitos EDU não reconciliados logo após rodar):
-- SELECT count(*) FROM public.coin_transactions
-- WHERE reason IN ('summary_educational','summary_educational_cross','summary_atlas')
--   AND amount < 0 AND reconciled_at IS NULL;
