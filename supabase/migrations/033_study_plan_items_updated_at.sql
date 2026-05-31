-- Adiciona updated_at em study_plan_items pra suportar:
--  - stuck recovery no cron worker (detecta items em `generating` há mais
--    de N minutos = worker anterior morreu sem completar)
--  - barra de progresso na UI sincronizada com o momento em que o item
--    virou `generating` (em vez de depender de timestamp client-side)
--
-- Trigger atualiza automaticamente em qualquer update do row.

alter table public.study_plan_items
  add column if not exists updated_at timestamptz not null default now();

create or replace function public.set_study_plan_items_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_study_plan_items_updated_at
  on public.study_plan_items;
create trigger trg_study_plan_items_updated_at
  before update on public.study_plan_items
  for each row execute procedure public.set_study_plan_items_updated_at();
