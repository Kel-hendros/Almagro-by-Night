-- =============================================================
-- Session Recaps: historial de sesiones por crónica
-- Applied: 2026-02-22
-- =============================================================

-- 1. Tabla
create table public.session_recaps (
  id             uuid default gen_random_uuid() primary key,
  chronicle_id   uuid not null references public.chronicles(id) on delete cascade,
  session_number integer not null,
  title          text not null,
  body           text,
  session_date   date,
  created_by     uuid not null references public.players(id),
  created_at     timestamptz default now(),
  updated_at     timestamptz default now()
);

-- 2. Índice para queries frecuentes (listar recaps de una crónica ordenados)
create index idx_session_recaps_chronicle
on public.session_recaps (chronicle_id, session_number asc);

-- 3. Trigger para updated_at automático
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_session_recaps_updated_at
before update on public.session_recaps
for each row
execute function public.set_updated_at();

-- 4. RLS
alter table public.session_recaps enable row level security;

-- SELECT: cualquier participante de la crónica puede leer
create policy session_recaps_select
on public.session_recaps
for select
to authenticated
using (
  chronicle_id in (select public.get_my_chronicle_ids())
);

-- INSERT: solo narrator de esa crónica
create policy session_recaps_insert
on public.session_recaps
for insert
to authenticated
with check (
  exists (
    select 1 from public.chronicle_participants cp
    inner join public.players p on p.id = cp.player_id
    where cp.chronicle_id = session_recaps.chronicle_id
      and cp.role = 'narrator'
      and p.user_id = auth.uid()
  )
);

-- UPDATE: solo narrator de esa crónica
create policy session_recaps_update
on public.session_recaps
for update
to authenticated
using (
  exists (
    select 1 from public.chronicle_participants cp
    inner join public.players p on p.id = cp.player_id
    where cp.chronicle_id = session_recaps.chronicle_id
      and cp.role = 'narrator'
      and p.user_id = auth.uid()
  )
);

-- DELETE: solo narrator de esa crónica
create policy session_recaps_delete
on public.session_recaps
for delete
to authenticated
using (
  exists (
    select 1 from public.chronicle_participants cp
    inner join public.players p on p.id = cp.player_id
    where cp.chronicle_id = session_recaps.chronicle_id
      and cp.role = 'narrator'
      and p.user_id = auth.uid()
  )
);
