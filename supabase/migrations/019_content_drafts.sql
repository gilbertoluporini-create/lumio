-- ============================================================================
-- Migration 019: Content Drafts (Fábrica de Conteúdo Multi-Rede)
-- ============================================================================
-- Sistema editorial: 1 ideia → N variações por rede social.
--   - Texto: IG caption / X thread / LinkedIn long-form / TikTok script
--   - Imagens: 1:1 (IG/FB) / 16:9 (X/LinkedIn) / 9:16 (TikTok/Stories)
--   - Status workflow: idea → drafted → approved → scheduled → published
--
-- Decisão de modelagem:
-- - 1 row por DRAFT (ideia mãe). Cada draft tem JSONB com variações por rede.
-- - Não normalizar em tabela `draft_variants` ainda — premature optimization,
--   queries vão sempre buscar o draft inteiro pra exibir no painel.
-- - URLs das imagens em JSONB (vão ser hospedadas no Supabase Storage no futuro;
--   por ora, URL externa OpenAI temporária — válida 1h, render no painel
--   mas depois precisa baixar/storage).
-- ============================================================================

create table if not exists public.content_drafts (
  id uuid primary key default gen_random_uuid(),

  -- Identidade da ideia
  idea_title text not null,                     -- "Curva do esquecimento — por que perdemos 70% em 24h"
  idea_summary text,                            -- ângulo/pitch da ideia
  category text default 'educacional'           -- educacional | opiniao | dados | bts
    check (category in ('educacional', 'opiniao', 'dados', 'bts')),

  -- Conteúdo gerado por rede
  -- Schema esperado:
  --   { instagram: { caption: "...", hashtags: [...], format: "feed_1x1" },
  --     x: { thread: ["tweet1", "tweet2", ...], hashtags: [...] },
  --     linkedin: { headline: "...", body: "...", hashtags: [...] },
  --     tiktok: { script: "...", duration_estimate_s: 45, hook: "..." } }
  content_per_network jsonb not null default '{}'::jsonb,

  -- Imagens geradas
  -- Schema esperado:
  --   { ratio_1x1: { url: "...", openai_revised_prompt: "...", generated_at: "..." },
  --     ratio_16x9: { url: "...", ... },
  --     ratio_9x16: { url: "...", ... } }
  images jsonb not null default '{}'::jsonb,

  -- Workflow
  status text not null default 'idea'
    check (status in ('idea', 'drafted', 'approved', 'scheduled', 'published', 'rejected')),
  generated_at timestamptz,                     -- quando IA gerou texto+imagens
  approved_at timestamptz,
  scheduled_for timestamptz,                    -- quando deve publicar (cron lê isso)
  published_at timestamptz,

  -- Resultado da publicação (1 row, várias plataformas — IDs externos)
  -- Schema esperado:
  --   { instagram: { id: "...", permalink: "...", published_at: "..." },
  --     facebook: { id: "...", permalink: "..." },
  --     x: { id: "...", permalink: "..." },
  --     linkedin: { id: "...", permalink: "..." } }
  publish_results jsonb default '{}'::jsonb,

  -- Métricas (atualizadas via cron futuro)
  reach_total int default 0,
  engagement_total int default 0,

  -- Audit
  created_by_admin text,                        -- email do admin que criou
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists content_drafts_status_idx
  on public.content_drafts (status, created_at desc);

create index if not exists content_drafts_scheduled_idx
  on public.content_drafts (scheduled_for)
  where status = 'scheduled';

create index if not exists content_drafts_category_idx
  on public.content_drafts (category, status);

-- Trigger updated_at (reutiliza function da migration 018)
drop trigger if exists content_drafts_touch on public.content_drafts;
create trigger content_drafts_touch
  before update on public.content_drafts
  for each row execute function public.touch_updated_at();
