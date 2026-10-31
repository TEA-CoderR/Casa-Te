-- Flyer: a short note shown with it (who the offers are for, where they apply) and a title per page
-- ("Cura persona", "Cura casa"…), so the shop can list the pages by name.
create or replace function public.valid_short_texts(p text[], p_max integer)
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(bool_and(char_length(x) <= p_max), true) from unnest(p) as x
$$;
revoke all on function public.valid_short_texts(text[], integer) from public, anon, authenticated;
grant execute on function public.valid_short_texts(text[], integer) to authenticated, service_role;

alter table public.flyers
  add column if not exists note text check (note is null or char_length(note) <= 300),
  add column if not exists page_titles text[] not null default '{}'
    check (cardinality(page_titles) <= 40 and public.valid_short_texts(page_titles, 60));
-- Same table grants and RLS as the other columns (flyers_read / flyers_manager_*).
