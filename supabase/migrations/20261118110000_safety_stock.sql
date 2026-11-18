-- Safety stock (plan v3 L7, owner 18/11): the last units on a store's shelf are not sold online, so an order
-- never takes the piece a customer is holding in the shop. Default in Impostazioni (app_settings.safety_stock,
-- 1 unit), changed per category (its value also applies to its subcategories) or per product.
-- inventory.sellable = quantity minus that, never below 0, kept by triggers; what customers see and order
-- (quote_cart, create_order, search, suggestions, the app) uses it. Staff still see and pick the real quantity.

alter table public.app_settings add column safety_stock integer not null default 1 check (safety_stock between 0 and 1000);
grant update (safety_stock) on public.app_settings to authenticated;
alter table public.categories add column safety_stock integer check (safety_stock is null or safety_stock between 0 and 1000);
alter table public.products add column safety_stock integer check (safety_stock is null or safety_stock between 0 and 1000);
alter table public.inventory add column sellable integer not null default 0 check (sellable >= 0);

-- The product's own value, else its category's, else the parent category's, else the shop default.
create or replace function public.safety_stock_for(p_product uuid)
returns integer language sql stable security definer set search_path = '' as $$
  select coalesce(p.safety_stock, c.safety_stock, parent.safety_stock, (select s.safety_stock from public.app_settings s), 0)
  from public.products p
  left join public.categories c on c.id = p.category_id
  left join public.categories parent on parent.id = c.parent_id
  where p.id = p_product;
$$;
revoke all on function public.safety_stock_for(uuid) from public, anon, authenticated;
grant execute on function public.safety_stock_for(uuid) to authenticated, service_role;

create or replace function public.inventory_sellable()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.sellable := greatest(new.quantity - coalesce(public.safety_stock_for(new.product_id), 0), 0);
  return new;
end $$;
revoke all on function public.inventory_sellable() from public, anon, authenticated;
create trigger inventory_sellable before insert or update on public.inventory
  for each row execute function public.inventory_sellable();

-- Recomputes the products given (all when null); rows already right are left alone.
create or replace function public.refresh_sellable(p_products uuid[] default null)
returns void language sql volatile security definer set search_path = '' as $$
  update public.inventory i set sellable = greatest(i.quantity - coalesce(public.safety_stock_for(i.product_id), 0), 0)
  where (p_products is null or i.product_id = any (p_products))
    and i.sellable is distinct from greatest(i.quantity - coalesce(public.safety_stock_for(i.product_id), 0), 0);
$$;
revoke all on function public.refresh_sellable(uuid[]) from public, anon, authenticated;
grant execute on function public.refresh_sellable(uuid[]) to service_role;

create or replace function public.products_safety_changed()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.refresh_sellable(array[new.id]);
  return null;
end $$;
revoke all on function public.products_safety_changed() from public, anon, authenticated;
create trigger products_safety_stock after update of safety_stock, category_id on public.products
  for each row when (old.safety_stock is distinct from new.safety_stock or old.category_id is distinct from new.category_id)
  execute function public.products_safety_changed();

create or replace function public.categories_safety_changed()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.refresh_sellable(array(select p.id from public.products p
    where p.category_id = new.id or p.category_id in (select c.id from public.categories c where c.parent_id = new.id)));
  return null;
end $$;
revoke all on function public.categories_safety_changed() from public, anon, authenticated;
create trigger categories_safety_stock after update of safety_stock, parent_id on public.categories
  for each row when (old.safety_stock is distinct from new.safety_stock or old.parent_id is distinct from new.parent_id)
  execute function public.categories_safety_changed();

create or replace function public.app_settings_safety_changed()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.refresh_sellable(null);
  return null;
end $$;
revoke all on function public.app_settings_safety_changed() from public, anon, authenticated;
create trigger app_settings_safety_stock after update of safety_stock on public.app_settings
  for each row when (old.safety_stock is distinct from new.safety_stock)
  execute function public.app_settings_safety_changed();

select public.refresh_sellable(null);

