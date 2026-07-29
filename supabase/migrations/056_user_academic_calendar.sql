-- 056_user_academic_calendar.sql
-- Calendário acadêmico da instituição do user (datas absolutas do semestre:
-- provas, entrega de notas, feriados, recessos, marcos letivos).
--
-- POR QUE NO PERFIL: `user_profiles` já é injetado no system prompt do agente
-- Lumi a cada turn (renderProfileForPrompt). Guardando o calendário aqui, a
-- Lumi passa a saber "a N2 é dia 10/06" e "16 a 18/02 é recesso" sem nenhuma
-- tool call — vira parametrização de contexto, não consulta.
--
-- Diferente de `exam_dates` (provas que o próprio user cadastra): este é o
-- calendário OFICIAL da faculdade, extraído do PDF institucional por IA.
--
-- Shape do JSONB:
-- {
--   "institution": "São Leopoldo Mandic Araras",
--   "year": 2026,
--   "sourceFile": "SLM.ARARAS.INS.R54-01-Calendario-2026.pdf",
--   "importedAt": "2026-07-29T12:00:00Z",
--   "events": [
--     {"date":"2026-06-10","endDate":null,"title":"Entrega de notas - N2",
--      "category":"nota","semester":1}
--   ]
-- }
-- category: 'prova' | 'nota' | 'prazo' | 'feriado' | 'recesso' | 'marco' | 'evento'

alter table if exists public.user_profiles
  add column if not exists academic_calendar jsonb;

comment on column public.user_profiles.academic_calendar is
  'Calendário acadêmico oficial da instituição (extraído por IA do PDF). Alimenta o contexto do agente Lumi. Ver migration 056.';
