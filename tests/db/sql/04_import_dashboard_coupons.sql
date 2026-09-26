-- CSV import, dashboard KPIs and coupon limits.
begin;

select tests.login('00000000-0000-0000-0000-0000000000d1');
set role authenticated;
do $$
declare r jsonb; v_rows jsonb;
begin
  v_rows := '[
    {"sku":"NEW-001","name":"Tovaglia cotone 140x180","category":"Tessile casa","price_cents":1490,"weight_g":450,
     "barcode":"8001234567890","vat_rate":22,"stock":{"LU1":10,"AR1":4},"image_url":"https://cdn.example.com/t.jpg"},
    {"sku":"carta-cucina","name":"Carta cucina 6 rotoli","category":"Pulizia","price_cents":549,"weight_g":1200},
    {"sku":"BAD 1","name":"Spazi nello SKU","price_cents":100,"weight_g":10},
    {"sku":"NEW-002","name":"Senza prezzo","weight_g":10},
    {"sku":"NEW-003","name":"Negozio inesistente","price_cents":100,"weight_g":10,"stock":{"XX9":1}}
  ]';

  r := public.admin_import_products(v_rows, true);
  perform tests.eq((r ->> 'created')::int, 1, 'dry run counts creations');
  perform tests.eq((r ->> 'updated')::int, 1, 'dry run counts updates');
  perform tests.eq((r ->> 'failed')::int, 3, 'dry run reports invalid rows');
  perform tests.eq((select count(*) from public.products where sku = 'NEW-001')::int, 0, 'dry run writes nothing');
  perform tests.eq((select count(*) from public.categories where slug = 'tessile-casa')::int, 0, 'dry run creates no categories');

  r := public.admin_import_products(v_rows, false);
  perform tests.eq((r ->> 'created')::int, 1, 'import creates');
  perform tests.eq((r -> 'rows' -> 2 ->> 'result'), 'error', 'row 3 reported as error');
  perform tests.eq((select price_cents from public.products where sku = 'carta-cucina'), 549, 'import updates price');
  perform tests.eq((select slug from public.products where sku = 'NEW-001'), 'tovaglia-cotone-140x180-new001', 'slug generated');
  perform tests.eq((select c.slug from public.products p join public.categories c on c.id = p.category_id where p.sku = 'NEW-001'),
    'tessile-casa', 'category created on the fly');
  perform tests.eq(tests.stock('LU1', 'NEW-001'), 10, 'stock imported LU1');
  perform tests.eq(tests.stock('AR1', 'NEW-001'), 4, 'stock imported AR1');
  perform tests.eq((select count(*) from public.product_images i join public.products p on p.id = i.product_id where p.sku = 'NEW-001')::int,
    1, 'image imported');
  perform tests.eq((select count(*) from public.products where sku = 'NEW-003')::int, 0, 'failed row rolled back entirely');

  -- Re-importing is idempotent for images.
  r := public.admin_import_products(jsonb_build_array(v_rows -> 0), false);
  perform tests.eq((r ->> 'updated')::int, 1, 'second import updates');
  perform tests.eq((select count(*) from public.product_images i join public.products p on p.id = i.product_id where p.sku = 'NEW-001')::int,
    1, 'no duplicate images');
end $$;
reset role;

do $$ begin
  perform tests.ok((select count(*) from public.inventory_movements where reason = 'import') >= 2, 'import stock movements logged');
end $$;

-- Coupon per-customer limit counts paid and live pending orders.
select tests.login('00000000-0000-0000-0000-00000000000a');
set role authenticated;
do $$
declare r jsonb;
begin
  r := public.create_order(tests.cart('LU1', 'store', '{"padella-28": 2}', '{"coupon_code":"BENVENUTO10"}'));
  perform tests.eq((select discount_cents from public.orders where id = (r ->> 'id')::uuid), 260, 'coupon applied to order');
  perform tests.throws($q$select public.create_order(tests.cart('LU1', 'store', '{"padella-28": 2}', '{"coupon_code":"BENVENUTO10"}'))$q$,
    'coupon_already_used', 'coupon once per customer');
end $$;
reset role;

set role service_role;
select public.mark_order_paid(id, null, 'pi_c', total_cents) from public.orders where coupon_code = 'BENVENUTO10';
reset role;
do $$ begin
  perform tests.eq((select redemptions from public.coupons where code = 'BENVENUTO10'), 1, 'redemption counted on payment');
end $$;

-- Exhausted coupons are refused for everyone.
update public.coupons set max_redemptions = 1 where code = 'BENVENUTO10';
select tests.login('00000000-0000-0000-0000-00000000000b');
set role authenticated;
do $$ begin
  perform tests.eq(public.quote_cart(tests.cart('LU1', 'store', '{"padella-28": 2}', '{"coupon_code":"BENVENUTO10"}')) ->> 'coupon_error',
    'coupon_exhausted', 'max redemptions enforced');
end $$;
reset role;

-- Dashboard
select tests.login('00000000-0000-0000-0000-0000000000d1');
set role authenticated;
do $$
declare d jsonb;
begin
  d := public.admin_dashboard(now() - interval '1 day', now() + interval '1 day');
  perform tests.eq((d ->> 'orders')::int, 1, 'one paid order');
  perform tests.eq((d ->> 'revenue_cents')::int, 2598 - 260, 'revenue net of discount');
  perform tests.eq((d -> 'top_products' -> 0 ->> 'sku'), 'padella-28', 'top product');
  perform tests.eq((d -> 'open_orders' ->> 'paid')::int, 1, 'open orders by status');
end $$;
reset role;

-- Store staff at AR1 would see nothing from LU1 (use LU1 staff moved to AR1 for the check).
update public.staff_members set store_id = tests.store('AR1') where role = 'store_staff';
select tests.login('00000000-0000-0000-0000-0000000000c1');
set role authenticated;
do $$
declare d jsonb;
begin
  d := public.admin_dashboard(now() - interval '1 day', now() + interval '1 day', tests.store('LU1'));
  perform tests.eq((d ->> 'orders')::int, 0, 'store staff dashboard restricted to own store');
end $$;
reset role;

-- Email changes in auth propagate to the profile.
update auth.users set email = 'nuova@example.com' where id = '00000000-0000-0000-0000-00000000000a';
do $$ begin
  perform tests.eq((select email from public.profiles where id = '00000000-0000-0000-0000-00000000000a'), 'nuova@example.com', 'email synced');
end $$;

rollback;
