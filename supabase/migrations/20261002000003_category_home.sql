-- Home page shows a short list of departments (max 8), chosen in the admin.
alter table public.categories add column show_on_home boolean not null default false;

-- Keep the home list short: at most 8 visible top-level categories flagged.
create or replace function public.categories_check_home()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.show_on_home and new.parent_id is not null then
    raise exception 'home_only_top_level' using errcode = 'P0001';
  end if;
  if new.show_on_home and (select count(*) from public.categories
      where show_on_home and id <> new.id) >= 8 then
    raise exception 'home_max_8' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger categories_check_home before insert or update of show_on_home, parent_id on public.categories
  for each row execute function public.categories_check_home();

revoke execute on function public.categories_check_home() from public, anon, authenticated;
grant execute on function public.categories_check_home() to service_role;
