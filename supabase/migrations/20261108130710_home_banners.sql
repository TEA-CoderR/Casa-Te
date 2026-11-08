-- Home banners: square campaign pictures at the top of the app home (design "Pulito", November 2026).
-- Managers publish them from the admin; the shop shows the ones inside their dates, in order.
-- A banner opens the offers, a department, a product or the flyer (or nothing).

create table public.home_banners (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) between 1 and 120),
  image_path text not null check (public.valid_asset_path(image_path)),
  link_kind text not null default 'none' check (link_kind in ('none', 'offers', 'category', 'product', 'flyer')),
  link_id uuid,
  starts_on date,
  ends_on date,
  sort integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint home_banners_link check ((link_kind in ('category', 'product')) = (link_id is not null)),
  constraint home_banners_dates check (starts_on is null or ends_on is null or ends_on >= starts_on)
);
create index home_banners_current_idx on public.home_banners (sort, created_at) where active;
create trigger home_banners_touch before update on public.home_banners for each row execute function public.touch_updated_at();

alter table public.home_banners enable row level security;
-- Customers see published banners inside their dates; managers see every banner.
create policy home_banners_read on public.home_banners for select using (
  (active and (starts_on is null or starts_on <= current_date) and (ends_on is null or ends_on >= current_date))
  or public.is_manager());
create policy home_banners_manager_insert on public.home_banners for insert to authenticated with check (public.is_manager());
create policy home_banners_manager_update on public.home_banners for update to authenticated
  using (public.is_manager()) with check (public.is_manager());
create policy home_banners_manager_delete on public.home_banners for delete to authenticated using (public.is_manager());

-- Explicit grants (newer projects grant nothing by default); RLS filters the rows.
revoke all on public.home_banners from anon, authenticated;
grant select on public.home_banners to anon, authenticated;
grant insert, update, delete on public.home_banners to authenticated;
grant all on public.home_banners to service_role;

-- Banner pictures: public read, managers write.
insert into storage.buckets (id, name, public)
values ('banners', 'banners', true)
on conflict (id) do nothing;

create policy "banners public read" on storage.objects for select
  using (bucket_id = 'banners');
create policy "banners managers insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'banners' and public.is_manager());
create policy "banners managers update" on storage.objects for update to authenticated
  using (bucket_id = 'banners' and public.is_manager());
create policy "banners managers delete" on storage.objects for delete to authenticated
  using (bucket_id = 'banners' and public.is_manager());
