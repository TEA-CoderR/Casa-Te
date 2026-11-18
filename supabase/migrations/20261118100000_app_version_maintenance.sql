-- Forced update and maintenance switch (plan v3 L5). The Supabase address is built into the app, so an old
-- version may call functions that have since changed: the back office can require a minimum app version, or put
-- the shop in maintenance (the app shows a full-screen message; new orders are refused here, whatever the app does).

alter table public.app_settings
  add column min_app_version text check (min_app_version is null or min_app_version ~ '^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$'),
  add column maintenance_message text check (maintenance_message is null or char_length(maintenance_message) between 1 and 300);
grant update (min_app_version, maintenance_message) on public.app_settings to authenticated;

create or replace function public.orders_maintenance_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.app_settings where maintenance_message is not null) then
    raise exception 'shop_maintenance' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke all on function public.orders_maintenance_guard() from public, anon, authenticated;
create trigger orders_maintenance before insert on public.orders
  for each row execute function public.orders_maintenance_guard();
