-- ============================================================================
-- Migration 020: Expande categorias do content_drafts
-- ============================================================================
-- Adiciona 'curiosidade' e 'pesquisa' às categorias permitidas. Resto mantém.
--
-- 'curiosidade': posts "você sabia?", fatos surpreendentes sobre aprendizagem,
--   memória, hábitos de estudo. Hook forte, dado memorável, sem precisar paper.
--
-- 'pesquisa': curadoria de artigos científicos recentes (Nature, Science, etc).
--   Cita paper, ano, conclusão, aplicação prática.
--
-- 'educacional': mantém — métodos e técnicas de estudo (Pomodoro, Active Recall, etc).
-- 'opiniao', 'dados', 'bts': mantém.
-- ============================================================================

alter table public.content_drafts
  drop constraint if exists content_drafts_category_check;

alter table public.content_drafts
  add constraint content_drafts_category_check
  check (category in ('educacional', 'curiosidade', 'pesquisa', 'opiniao', 'dados', 'bts'));
