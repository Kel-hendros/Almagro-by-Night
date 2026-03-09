-- Public recap shares
-- Creates stable public tokens for session recaps so the shared version
-- always reflects the current recap content.

begin;

create table if not exists public.recap_shares (
  id uuid primary key default gen_random_uuid(),
  recap_id uuid not null unique references public.session_recaps(id) on delete cascade,
  chronicle_id uuid not null references public.chronicles(id) on delete cascade,
  created_by_player_id uuid not null references public.players(id) on delete restrict,
  share_token text not null unique default encode(gen_random_bytes(16), 'hex'),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_recap_shares_chronicle
on public.recap_shares (chronicle_id, created_at desc);

drop trigger if exists trg_recap_shares_updated_at on public.recap_shares;
create trigger trg_recap_shares_updated_at
before update on public.recap_shares
for each row execute function public.touch_updated_at();

alter table public.recap_shares enable row level security;

revoke all on public.recap_shares from anon, authenticated;

drop policy if exists recap_shares_manage_narrator on public.recap_shares;
create policy recap_shares_manage_narrator
on public.recap_shares
for all
to authenticated
using (public.is_narrator_or_chronicle_owner(chronicle_id))
with check (public.is_narrator_or_chronicle_owner(chronicle_id));

create or replace function public.ensure_recap_share(p_recap_id uuid)
returns table (
  share_token text,
  chronicle_id uuid,
  recap_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recap public.session_recaps%rowtype;
  v_player_id uuid;
begin
  if p_recap_id is null then
    raise exception 'recap_id_required';
  end if;

  select p.id
    into v_player_id
  from public.players p
  where p.user_id = auth.uid()
  limit 1;

  if v_player_id is null then
    raise exception 'player_not_found';
  end if;

  select sr.*
    into v_recap
  from public.session_recaps sr
  where sr.id = p_recap_id
  limit 1;

  if v_recap.id is null then
    raise exception 'recap_not_found';
  end if;

  if not public.is_narrator_or_chronicle_owner(v_recap.chronicle_id) then
    raise exception 'not_authorized';
  end if;

  return query
  insert into public.recap_shares (
    recap_id,
    chronicle_id,
    created_by_player_id,
    is_active
  )
  values (
    v_recap.id,
    v_recap.chronicle_id,
    v_player_id,
    true
  )
  on conflict on constraint recap_shares_recap_id_key
  do update
    set is_active = true,
        updated_at = now()
  returning public.recap_shares.share_token,
            public.recap_shares.chronicle_id,
            public.recap_shares.recap_id;
end;
$$;

grant execute on function public.ensure_recap_share(uuid) to authenticated;

create or replace function public.get_public_recap_share(p_share_token text)
returns table (
  share_token text,
  recap_id uuid,
  chronicle_id uuid,
  chronicle_name text,
  chronicle_creator_id uuid,
  title text,
  session_number integer,
  session_date date,
  body text,
  recap_updated_at timestamptz,
  share_created_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select
    rs.share_token,
    sr.id as recap_id,
    sr.chronicle_id,
    c.name as chronicle_name,
    c.creator_id as chronicle_creator_id,
    sr.title,
    sr.session_number,
    sr.session_date,
    sr.body,
    sr.updated_at as recap_updated_at,
    rs.created_at as share_created_at
  from public.recap_shares rs
  join public.session_recaps sr on sr.id = rs.recap_id
  join public.chronicles c on c.id = sr.chronicle_id
  where rs.share_token = p_share_token
    and rs.is_active = true
  limit 1;
$$;

grant execute on function public.get_public_recap_share(text) to anon, authenticated;

commit;
