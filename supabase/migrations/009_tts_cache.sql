-- ============================================================================
-- Migration: tts_cache — Cache de áudios TTS pra economizar chamadas ElevenLabs
-- ============================================================================
-- Cada texto+voz gera um áudio uma única vez. Próximos plays do mesmo texto
-- retornam URL cached sem custo. Crítico pro "Ouvir resumo" (texto longo,
-- mesmo conteúdo tocado várias vezes).
--
-- Hash do texto = SHA-256 hex (calculado no server antes da chamada).
-- Áudio armazenado no bucket `tts-audio` (público, MIME audio/mpeg).
-- ============================================================================

create table if not exists public.tts_cache (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  text_hash text not null,
  voice_id text not null,
  audio_url text not null,
  char_count int not null,
  coins_charged int not null default 0,
  /** Opcional: associa com lecture_id pra invalidar cache quando resumo muda. */
  lecture_id uuid,
  created_at timestamptz not null default now(),
  -- Unicidade por user + texto + voz (mesmo texto, mesma voz → 1 só áudio)
  constraint tts_cache_unique unique (user_id, text_hash, voice_id)
);

create index if not exists tts_cache_user_idx on public.tts_cache(user_id);
create index if not exists tts_cache_lecture_idx on public.tts_cache(lecture_id);
create index if not exists tts_cache_lookup_idx
  on public.tts_cache(user_id, text_hash, voice_id);

-- RLS
alter table public.tts_cache enable row level security;

drop policy if exists "users select own tts_cache" on public.tts_cache;
create policy "users select own tts_cache" on public.tts_cache
  for select using (auth.uid() = user_id);

drop policy if exists "users insert own tts_cache" on public.tts_cache;
create policy "users insert own tts_cache" on public.tts_cache
  for insert with check (auth.uid() = user_id);

drop policy if exists "users delete own tts_cache" on public.tts_cache;
create policy "users delete own tts_cache" on public.tts_cache
  for delete using (auth.uid() = user_id);
