-- Migration 014: covers de artigos da Central de Ajuda
-- Tabela simples: slug do artigo → URL pública da capa (gerada via OpenAI gpt-image-1)
-- + bucket Storage `article-covers` (public read) deve ser criado manualmente no dashboard.

create table if not exists public.help_article_covers (
  slug text primary key,
  category_slug text not null,
  image_url text not null,
  prompt text,
  generated_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- RLS: leitura pública (qualquer um pode ler capa de artigo), escrita só service_role.
alter table public.help_article_covers enable row level security;

drop policy if exists "help_article_covers read public" on public.help_article_covers;
create policy "help_article_covers read public"
  on public.help_article_covers
  for select
  using (true);

-- (Sem policy de insert/update/delete → só service_role consegue mexer, que é o
-- que rodam os endpoints admin de regeneração de capa.)

-- Trigger pra manter updated_at
create or replace function public.touch_help_article_covers_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_help_article_covers_touch on public.help_article_covers;
create trigger trg_help_article_covers_touch
  before update on public.help_article_covers
  for each row execute function public.touch_help_article_covers_updated_at();
