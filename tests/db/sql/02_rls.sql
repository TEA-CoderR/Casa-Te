-- Row level security: who can read and write what.
begin;

-- Create one pending order for each customer (as the customer, via the RPC).
select tests.login('00000000-0000-0000-0000-00000000000a');
set role authenticated;
select public.create_order(tests.cart('LU1', 'store', '{"carta-cucina": 1}'));
reset role;
select tests.login('00000000-0000-0000-0000-00000000000b');
set role authenticated;
select public.create_order(tests.cart('AR1', 'store', '{"padella-28": 1}'));
reset role;

-- Anonymous visitors
select tests.logout();
set role anon;
do $$
declare n integer;
begin
  perform tests.eq((select count(*) from public.products)::int, 8, 'anon reads active products');
  perform tests.eq((select count(*) from public.stores)::int, 5, 'anon reads stores');
  perform tests.ok((select count(*) from public.inventory) > 0, 'anon reads stock levels');
  perform tests.eq((select count(*) from public.orders)::int, 0, 'anon sees no orders');
  perform tests.eq((select count(*) from public.coupons)::int, 0, 'anon cannot list coupons');
  perform tests.eq((select count(*) from public.profiles)::int, 0, 'anon sees no profiles');
  update public.products set price_cents = 1;
  get diagnostics n = row_count;
  perform tests.eq(n, 0, 'anon cannot change prices');
  perform tests.throws($q$insert into public.categories (slug, name) values ('x', 'X')$q$, 'row-level security', 'anon cannot add categories');
  perform tests.throws($q$select public.create_order(tests.cart('LU1', 'store', '{"carta-cucina": 1}'))$q$,
    'permission denied', 'anon cannot create orders');
  perform tests.throws($q$select public.mark_order_paid(gen_random_uuid(), 'x', 'y', 100)$q$, 'permission denied', 'anon cannot mark paid');
end $$;
reset role;

-- Inactive products are hidden from the public.
update public.products set active = false where sku = 'organizer-grande';
set role anon;
do $$ begin
  perform tests.eq((select count(*) from public.products)::int, 7, 'inactive product hidden');
end $$;
reset role;

-- Customer A
select tests.login('00000000-0000-0000-0000-00000000000a');
set role authenticated;
do $$
declare v_order uuid;
begin
  perform tests.eq((select count(*) from public.orders)::int, 1, 'customer sees only own orders');
  perform tests.eq((select customer_email from public.orders), 'cliente.a@example.com', 'own order email');
  perform tests.eq((select count(*) from public.order_items)::int, 1, 'own order items only');
  perform tests.eq((select count(*) from public.profiles)::int, 1, 'own profile only');
  select id into v_order from public.orders;

  -- Direct writes to orders are impossible; money only moves through RPCs.
  perform tests.throws(format($q$update public.orders set total_cents = 50 where id = %L$q$, v_order), 'permission denied', 'cannot edit order');
  perform tests.throws(format($q$update public.orders set status = 'paid' where id = %L$q$, v_order), 'permission denied', 'cannot mark own order paid');
  perform tests.throws($q$insert into public.orders (store_id, fulfilment, subtotal_cents, shipping_cents, total_cents, total_weight_g)
    values (tests.store('LU1'), 'store', 100, 0, 100, 1)$q$, 'permission denied', 'cannot insert orders');
end $$;

do $$
declare n integer;
begin
  -- Updating picked quantity on own order silently affects 0 rows (policy only for staff).
  update public.order_items set picked_quantity = 1;
  get diagnostics n = row_count;
  perform tests.eq(n, 0, 'customer cannot pick items');
  perform tests.throws($q$update public.order_items set unit_price_cents = 1$q$, 'permission denied', 'cannot change line price');
  perform tests.throws($q$select public.mark_order_paid(gen_random_uuid(), 'x', 'y', 100)$q$, 'permission denied', 'customer cannot mark paid');
  perform tests.throws($q$select public.record_refund(gen_random_uuid(), 100, 'r', 'x', null)$q$, 'permission denied', 'customer cannot record refunds');
  perform tests.throws($q$select public.expire_stale_orders()$q$, 'permission denied', 'customer cannot run jobs');
  perform tests.throws($q$select public.admin_import_products('[]'::jsonb, false)$q$, 'forbidden', 'customer cannot import');
  perform tests.throws($q$select public.admin_dashboard(now() - interval '1 day', now())$q$, 'forbidden', 'customer cannot see KPIs');

  -- Profile: may edit allowed columns only.
  update public.profiles set full_name = 'Anna Rossi', marketing_opt_in = true;
  get diagnostics n = row_count;
  perform tests.eq(n, 1, 'profile update');
  perform tests.throws($q$update public.profiles set id = gen_random_uuid()$q$, 'permission denied', 'cannot change profile id');
  perform tests.throws($q$update public.profiles set email = 'x@y.z'$q$, 'permission denied', 'cannot change profile email');
  perform tests.eq((select email from public.profiles), 'cliente.a@example.com', 'profile email copied from auth');
  update public.profiles set full_name = 'Hacker' where id = '00000000-0000-0000-0000-00000000000b';
  get diagnostics n = row_count;
  perform tests.eq(n, 0, 'cannot edit other profile');

  -- Addresses: own only.
  insert into public.addresses (user_id, full_name, line1, city, province, postal_code, phone)
  values (auth.uid(), 'Anna Rossi', 'Via Roma 1', 'Lucca', 'LU', '55100', '3331234567');
  perform tests.throws($q$insert into public.addresses (user_id, full_name, line1, city, province, postal_code, phone)
    values ('00000000-0000-0000-0000-00000000000b', 'X', 'Via Y 1', 'Lucca', 'LU', '55100', '3331234567')$q$,
    'row-level security', 'cannot create address for someone else');

  perform tests.eq(public.is_staff(), false, 'customer is not staff');
  perform tests.throws($q$insert into public.staff_members (user_id, role) values (auth.uid(), 'admin')$q$,
    'row-level security', 'customer cannot self-promote');
end $$;
reset role;

-- Store staff (LU1): sees only LU1 orders, cannot edit catalogue.
select tests.login('00000000-0000-0000-0000-0000000000c1');
set role authenticated;
do $$
declare n integer;
begin
  perform tests.eq((select count(*) from public.orders)::int, 1, 'store staff sees only own store orders');
  perform tests.eq((select code from public.stores s join public.orders o on o.store_id = s.id limit 1), 'LU1', 'LU1 order');
  update public.products set price_cents = 1;
  get diagnostics n = row_count;
  perform tests.eq(n, 0, 'store staff cannot change prices');
  perform tests.throws($q$select public.staff_set_stock(tests.store('AR1'), tests.product('carta-cucina'), 5)$q$, 'forbidden', 'no stock edits for other stores');
  perform public.staff_set_stock(tests.store('LU1'), tests.product('carta-cucina'), 40);
  perform tests.eq(tests.stock('LU1', 'carta-cucina'), 40, 'stocktake own store');
  perform tests.eq((select count(*) from public.coupons)::int, 0, 'store staff cannot see coupons');
  perform tests.eq((select count(*) from public.staff_members)::int, 1, 'staff sees only own staff row');
  perform tests.eq((select count(*) from public.profiles where id <> auth.uid())::int, 0, 'store staff cannot list customer profiles');
end $$;
reset role;

do $$ begin
  perform tests.eq((select reason from public.inventory_movements where delta = 40 - 24 order by id desc limit 1), 'stocktake', 'stocktake logged');
end $$;

-- Manager: full catalogue and order visibility.
select tests.login('00000000-0000-0000-0000-0000000000d1');
set role authenticated;
do $$
declare n integer;
begin
  perform tests.eq((select count(*) from public.orders)::int, 2, 'manager sees all orders');
  perform tests.ok((select count(*) from public.profiles) >= 2, 'manager can read customer profiles');
  perform tests.eq((select count(*) from public.products)::int, 8, 'manager sees inactive products too');
  update public.products set price_cents = 899 where sku = 'carta-cucina';
  get diagnostics n = row_count;
  perform tests.eq(n, 1, 'manager can change prices');
  insert into public.coupons (code, kind, value) values ('ESTATE5', 'fixed', 500);
  perform tests.throws($q$insert into public.stores (code, name, city) values ('PI1', 'Pisa', 'Pisa')$q$,
    'row-level security', 'only admins manage stores');
  perform tests.throws($q$insert into public.staff_members (user_id, role) values ('00000000-0000-0000-0000-00000000000a', 'admin')$q$,
    'row-level security', 'only admins manage staff');
end $$;
reset role;

-- Admin
select tests.login('00000000-0000-0000-0000-0000000000e1');
set role authenticated;
do $$ begin
  insert into public.stores (code, name, city) values ('PI1', 'CASA & TE Pisa', 'Pisa');
  perform tests.eq((select count(*) from public.staff_members)::int, 3, 'admin sees all staff');
end $$;
reset role;

rollback;
