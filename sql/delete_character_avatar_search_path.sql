begin;

create or replace function public.delete_character_avatar()
returns trigger
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  avatar_path text;
begin
  if old.avatar_url is not null then
    avatar_path := substring(old.avatar_url from 'character-avatars/(.*)$');

    if avatar_path is not null then
      delete from storage.objects
      where bucket_id = 'character-avatars'
      and name = avatar_path;
    end if;
  end if;

  return old;
end;
$$;

drop trigger if exists on_character_delete on public.character_sheets;
create trigger on_character_delete
after delete on public.character_sheets
for each row
execute function public.delete_character_avatar();

commit;
