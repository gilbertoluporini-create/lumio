-- ============================================================================
-- Separação semântica: documents (uploads) + summaries (asset derivado)
-- ============================================================================
-- Antes: lecture.summary (jsonb) misturava aula gravada com resumo gerado.
-- Agora: aula é aula, documento é documento, resumo é resumo (FK pra um dos dois).
-- ============================================================================

-- 1) documents: arquivo bruto enviado pelo user (PDF ou texto colado),
--    sem gravação/transcrição associada.
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  subject_id uuid references public.subjects on delete set null,
  title text not null,
  source_kind text not null check (source_kind in ('pdf', 'text', 'audio_external')),
  source_url text,
  source_text text,
  page_count int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists documents_user_id_idx on public.documents (user_id);
create index if not exists documents_subject_id_idx on public.documents (subject_id);

-- 2) summaries: asset derivado. Aponta para UMA fonte (lecture XOR document).
create table if not exists public.summaries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  subject_id uuid references public.subjects on delete set null,
  lecture_id uuid references public.lectures on delete cascade,
  document_id uuid references public.documents on delete cascade,
  title text not null,
  content jsonb not null,
  images jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint summary_source_exclusive check (
    (lecture_id is not null and document_id is null) or
    (lecture_id is null and document_id is not null)
  )
);
create index if not exists summaries_user_id_idx on public.summaries (user_id);
create index if not exists summaries_subject_id_idx on public.summaries (subject_id);
create index if not exists summaries_lecture_id_idx on public.summaries (lecture_id);
create index if not exists summaries_document_id_idx on public.summaries (document_id);

-- 3) Triggers updated_at
drop trigger if exists documents_touch on public.documents;
create trigger documents_touch before update on public.documents
  for each row execute function public.touch_updated_at();
drop trigger if exists summaries_touch on public.summaries;
create trigger summaries_touch before update on public.summaries
  for each row execute function public.touch_updated_at();

-- 4) RLS
alter table public.documents enable row level security;
alter table public.summaries enable row level security;

drop policy if exists documents_owner_all on public.documents;
create policy documents_owner_all on public.documents
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists summaries_owner_all on public.summaries;
create policy summaries_owner_all on public.summaries
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 5) Backfill: copia resumos existentes de lectures.summary -> summaries
--    Idempotente: insere só se ainda não existir summary com o mesmo lecture_id.
insert into public.summaries (user_id, subject_id, lecture_id, title, content, created_at, updated_at)
select
  l.user_id,
  l.subject_id,
  l.id,
  l.title,
  l.summary,
  coalesce((l.summary->>'generatedAt')::timestamptz, l.updated_at),
  l.updated_at
from public.lectures l
where l.summary is not null
  and not exists (
    select 1 from public.summaries s where s.lecture_id = l.id
  );
