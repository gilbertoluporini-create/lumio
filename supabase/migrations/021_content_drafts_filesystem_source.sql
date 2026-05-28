-- ============================================================================
-- Migration 021: Content Drafts — Filesystem Source of Truth
-- ============================================================================
-- Refator: posts editoriais agora vêm da pasta `content/marketing/posts/`
-- (versionada no git). Endpoint /api/admin/marketing/content/sync lê filesystem
-- e upserta drafts via `slug` (== nome da pasta).
--
-- Mudanças:
--   - +slug (text unique) — chave de upsert estável vinda do filesystem
--   - +source (text) — 'filesystem' | 'manual' (drafts antigos do Estúdio
--     ficam como 'manual'; novos via sync = 'filesystem')
--   - sync_error (text) — última falha de publish pra mostrar no painel
-- ============================================================================

alter table public.content_drafts
  add column if not exists slug text,
  add column if not exists source text default 'manual'
    check (source in ('manual', 'filesystem')),
  add column if not exists sync_error text;

create unique index if not exists content_drafts_slug_idx
  on public.content_drafts (slug)
  where slug is not null;

-- idea_title fica relaxado: sync pode preencher com title ou slug se faltar
alter table public.content_drafts
  alter column idea_title drop not null;
