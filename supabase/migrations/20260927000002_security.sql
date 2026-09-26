-- Row level security and role helpers.
-- Principle: customers can read the public catalogue and their own data; all writes that
-- involve money or stock go through SECURITY DEFINER functions (see migration 0003).

-- ---------------------------------------------------------------------------
-- Staff helpers (SECURITY DEFINER so they can read staff_members under RLS)
-- ---------------------------------------------------------------------------
create or replace function public.staff_role()
returns text language sql stable security definer set search_path = '' as $$
  select role from public.staff_members where user_id = auth.uid() and active
$$;

create or replace function public.staff_store_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select store_id from public.staff_members where user_id = auth.uid() and active
$$;

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.staff_members where user_id = auth.uid() and active)
$$;

-- admin + manager manage the catalogue, prices, coupons, shipping rules.
create or replace function public.is_manager()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.staff_members
                 where user_id = auth.uid() and active and role in ('admin', 'manager'))
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.staff_members
                 where user_id = auth.uid() and active and role = 'admin')
$$;

-- Store staff only see their own store; admins and managers see all stores.
create or replace function public.staff_can_access_store(p_store_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.staff_members
                 where user_id = auth.uid() and active
                   and (role in ('admin', 'manager') or store_id = p_store_id))
$$;

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere
-- ---------------------------------------------------------------------------
alter table public.stores enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.product_images enable row level security;
alter table public.inventory enable row level security;
alter table public.pickup_points enable row level security;
alter table public.shipping_rates enable row level security;
alter table public.coupons enable row level security;
alter table public.profiles enable row level security;
alter table public.addresses enable row level security;
alter table public.staff_members enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_events enable row level security;
alter table public.refunds enable row level security;
alter table public.stripe_events enable row level security;
alter table public.inventory_movements enable row level security;

-- ---------------------------------------------------------------------------
-- Public catalogue (read: everyone; write: managers)
-- ---------------------------------------------------------------------------
create policy stores_read on public.stores for select using (active or public.is_staff());
create policy stores_write on public.stores for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy categories_read on public.categories for select using (active or public.is_staff());
create policy categories_write on public.categories for all to authenticated
  using (public.is_manager()) with check (public.is_manager());

create policy products_read on public.products for select using (active or public.is_staff());
create policy products_write on public.products for all to authenticated
  using (public.is_manager()) with check (public.is_manager());

create policy product_images_read on public.product_images for select using (true);
create policy product_images_write on public.product_images for all to authenticated
  using (public.is_manager()) with check (public.is_manager());

create policy inventory_read on public.inventory for select using (true);
-- Store staff may do stock counts for their own store; managers for any store.
create policy inventory_write on public.inventory for all to authenticated
  using (public.staff_can_access_store(store_id)) with check (public.staff_can_access_store(store_id));

create policy pickup_points_read on public.pickup_points for select using (active or public.is_staff());
create policy pickup_points_write on public.pickup_points for all to authenticated
  using (public.is_manager()) with check (public.is_manager());

create policy shipping_rates_read on public.shipping_rates for select using (active or public.is_staff());
create policy shipping_rates_write on public.shipping_rates for all to authenticated
  using (public.is_manager()) with check (public.is_manager());

-- Coupons are never listed publicly; codes are validated inside quote_cart().
create policy coupons_staff on public.coupons for all to authenticated
  using (public.is_manager()) with check (public.is_manager());

-- ---------------------------------------------------------------------------
-- Customer data
-- ---------------------------------------------------------------------------
create policy profiles_own_read on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_staff());
create policy profiles_own_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy addresses_own on public.addresses for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy staff_self_read on public.staff_members for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
create policy staff_admin_write on public.staff_members for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Orders: read-only for clients. Creation and status changes use RPCs.
create policy orders_read on public.orders for select to authenticated
  using (user_id = auth.uid() or public.staff_can_access_store(store_id));

create policy order_items_read on public.order_items for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id
                 and (o.user_id = auth.uid() or public.staff_can_access_store(o.store_id))));
-- Pickers record picked quantities directly.
create policy order_items_pick on public.order_items for update to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id
                 and o.status = 'picking' and public.staff_can_access_store(o.store_id)))
  with check (exists (select 1 from public.orders o where o.id = order_id
                 and o.status = 'picking' and public.staff_can_access_store(o.store_id)));

create policy order_events_read on public.order_events for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id
                 and ((o.user_id = auth.uid() and visible_to_customer)
                      or public.staff_can_access_store(o.store_id))));

create policy refunds_read on public.refunds for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id
                 and public.staff_can_access_store(o.store_id)));

create policy inventory_movements_read on public.inventory_movements for select to authenticated
  using (public.staff_can_access_store(store_id));

-- stripe_events: no policies => only service_role (bypasses RLS) can touch it.

-- Pickers can only change picked_quantity, nothing else on an order line.
revoke update on public.order_items from anon, authenticated;
grant update (picked_quantity) on public.order_items to authenticated;

-- Customers must not change their own profile's id; column grants keep updates narrow.
revoke update on public.profiles from anon, authenticated;
grant update (full_name, phone, preferred_store_id, marketing_opt_in) on public.profiles to authenticated;

-- Orders are never written directly by clients.
revoke insert, update, delete on public.orders, public.order_events, public.refunds from anon, authenticated;
revoke all on public.stripe_events from anon, authenticated;
revoke insert, update, delete on public.inventory_movements from anon, authenticated;
