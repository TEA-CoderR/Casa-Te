-- Monthly flyer ("Volantino"): managers publish it from the admin, the shop shows the current one.
-- A flyer is a PDF and/or a set of page images stored in the public bucket "flyers".

-- Storage object path inside a bucket, or an absolute https URL (never another scheme).
create or replace function public.valid_asset_path(p text)
returns boolean language sql immutable set search_path = '' as $$
  select p is not null and char_length(p) between 1 and 500 and (p ~ '^https://' or p !~ '^[a-z]+:')
$$;

create or replace function public.valid_asset_paths(p text[])
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(bool_and(public.valid_asset_path(x)), true) from unnest(p) as x
$$;

create table public.flyers (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) between 1 and 120),
  valid_from date,
  valid_to date,
  pdf_path text check (pdf_path is null or public.valid_asset_path(pdf_path)),
  page_paths text[] not null default '{}' check (cardinality(page_paths) <= 40 and public.valid_asset_paths(page_paths)),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint flyers_has_content check (pdf_path is not null or cardinality(page_paths) > 0),
  constraint flyers_dates check (valid_from is null or valid_to is null or valid_to >= valid_from)
);
create index flyers_current_idx on public.flyers (valid_from desc nulls last) where active;
create trigger flyers_touch before update on public.flyers for each row execute function public.touch_updated_at();

alter table public.flyers enable row level security;
-- Customers see published flyers inside their validity window; managers see every flyer.
create policy flyers_read on public.flyers for select using (
  (active and (valid_from is null or valid_from <= current_date) and (valid_to is null or valid_to >= current_date))
  or public.is_manager());
create policy flyers_manager_insert on public.flyers for insert to authenticated with check (public.is_manager());
create policy flyers_manager_update on public.flyers for update to authenticated
  using (public.is_manager()) with check (public.is_manager());
create policy flyers_manager_delete on public.flyers for delete to authenticated using (public.is_manager());

-- Explicit grants (newer projects grant nothing by default); RLS filters the rows.
revoke all on public.flyers from anon, authenticated;
grant select on public.flyers to anon, authenticated;
grant insert, update, delete on public.flyers to authenticated;
grant all on public.flyers to service_role;

-- Function privileges (Supabase grants EXECUTE to anon/authenticated by default). The checks run as
-- part of writes by managers, so authenticated keeps EXECUTE; anon never writes flyers.
revoke all on function public.valid_asset_path(text), public.valid_asset_paths(text[]) from public, anon, authenticated;
grant execute on function public.valid_asset_path(text), public.valid_asset_paths(text[]) to authenticated, service_role;

-- Flyer files: public read, managers write.
insert into storage.buckets (id, name, public)
values ('flyers', 'flyers', true)
on conflict (id) do nothing;

create policy "flyers public read" on storage.objects for select
  using (bucket_id = 'flyers');
create policy "flyers managers insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'flyers' and public.is_manager());
create policy "flyers managers update" on storage.objects for update to authenticated
  using (bucket_id = 'flyers' and public.is_manager());
create policy "flyers managers delete" on storage.objects for delete to authenticated
  using (bucket_id = 'flyers' and public.is_manager());
