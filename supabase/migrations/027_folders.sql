-- ============================================================================
-- Migration 027: Pastas (folders) — organização dentro de matérias
-- ============================================================================
-- Cada pasta pertence a uma matéria (subject_id) e pode estar dentro de outra
-- pasta (parent_folder_id null = raiz da matéria). Cascade no subject delete:
-- se a matéria some, as pastas dela somem. Self-FK no parent: se uma pasta
-- pai é deletada, vamos preferir SET NULL (sobe filhos pra raiz) em vez de
-- cascade — menos destrutivo. O endpoint de delete pode oferecer cascade
-- opt-in.
--
-- Assets organizáveis ganham coluna `folder_id`:
--   * documents
--   * lectures
--   * summaries
--   * lecture_assets (flashcards / quiz / mindmap derivados de lectures)
--
-- folder_id é opcional (null = raiz da matéria), independente de subject_id.
-- Constraint de coerência: folder.subject_id deve bater com asset.subject_id
-- é validada na aplicação, não no DB (pra permitir reorganizações graduais).
-- ============================================================================

create extension if not exists "pgcrypto";

-- 1) Tabela folders
create table if not exists public.folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  parent_folder_id uuid references public.folders(id) on delete set null,
  name text not null check (length(trim(name)) > 0),
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Não duas pastas com mesmo nome no mesmo nível (mesma matéria + mesmo pai).
-- Coalesce no parent_folder_id pra tratar root (null) como um valor único.
create unique index if not exists folders_unique_name_per_level
  on public.folders (user_id, subject_id, coalesce(parent_folder_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));

create index if not exists folders_user_subject_idx
  on public.folders (user_id, subject_id, parent_folder_id, position);

create index if not exists folders_parent_idx
  on public.folders (parent_folder_id);

-- Trigger updated_at (reusa função existente do schema)
drop trigger if exists folders_touch on public.folders;
create trigger folders_touch before update on public.folders
  for each row execute function public.touch_updated_at();

-- RLS
alter table public.folders enable row level security;

drop policy if exists folders_owner_all on public.folders;
create policy folders_owner_all on public.folders
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 2) folder_id em assets organizáveis
alter table public.documents
  add column if not exists folder_id uuid references public.folders(id) on delete set null;
create index if not exists documents_folder_idx on public.documents (folder_id);

alter table public.lectures
  add column if not exists folder_id uuid references public.folders(id) on delete set null;
create index if not exists lectures_folder_idx on public.lectures (folder_id);

alter table public.summaries
  add column if not exists folder_id uuid references public.folders(id) on delete set null;
create index if not exists summaries_folder_idx on public.summaries (folder_id);

alter table public.lecture_assets
  add column if not exists folder_id uuid references public.folders(id) on delete set null;
create index if not exists lecture_assets_folder_idx on public.lecture_assets (folder_id);
