-- ERP sync: batches create products and set store prices, dated promotions and stock; checkout charges the store
-- price; stock held by online orders not yet rung up at the till is kept out of the sellable quantity.
begin;

do $$
declare r jsonb; v_today date := public.shop_today();
begin
  -- Pure price rule
  perform tests.eq((select row(price_cents, compare_at_price_cents)::text from public.store_unit_price(500, null, null, null, null, null, v_today)), '(500,)', 'catalogue price');
  perform tests.eq((select row(price_cents, compare_at_price_cents)::text from public.store_unit_price(500, 700, null, null, null, null, v_today)), '(500,700)', 'admin strike-through kept');
  perform tests.eq((select row(price_cents, compare_at_price_cents)::text from public.store_unit_price(500, 700, 450, null, null, null, v_today)), '(450,)', 'store price wins, no admin strike-through');
  perform tests.eq((select row(price_cents, compare_at_price_cents)::text from public.store_unit_price(500, null, 450, 300, v_today, v_today, v_today)), '(300,450)', 'promo valid today');
  perform tests.eq((select row(price_cents, compare_at_price_cents)::text from public.store_unit_price(500, null, 450, 300, v_today + 1, null, v_today)), '(450,)', 'promo not started');
  perform tests.eq((select row(price_cents, compare_at_price_cents)::text from public.store_unit_price(500, null, 450, 300, null, v_today - 1, v_today)), '(450,)', 'promo ended');
  perform tests.eq((select row(price_cents, compare_at_price_cents)::text from public.store_unit_price(500, null, 450, 460, null, null, v_today)), '(450,)', 'promo above price ignored');

  -- Batch: one new product with weight and photo URL, one without weight, one bad code; stock and a running promo in LU1.
  r := public.erp_apply_batch(jsonb_build_object('store_code', 'lu1', 'sent_at', now() - interval '1 minute',
    'products', jsonb_build_array(
      jsonb_build_object('erp_code', '900001', 'name', 'Scopa Città XL', 'barcode', '8001234567890', 'vat_rate', 22, 'price_cents', 399, 'weight_g', 600,
        'image_url', 'https://img.example.com/8001234567890.jpg'),
      jsonb_build_object('erp_code', '900002', 'name', 'Senza peso', 'price_cents', 199),
      jsonb_build_object('erp_code', 'bad code', 'name', 'X', 'price_cents', 1, 'weight_g', 1)),
    'store_items', jsonb_build_array(
      jsonb_build_object('erp_code', '900001', 'price_cents', 349, 'promo_price_cents', 299, 'promo_starts_on', v_today - 2, 'promo_ends_on', v_today + 5, 'quantity', 5),
      jsonb_build_object('erp_code', '900002', 'price_cents', 199, 'quantity', 3))));
  perform tests.eq((r ->> 'created')::int, 2, 'products created (weight optional)');
  perform tests.eq((select array_agg(x ->> 'reason' order by x ->> 'reason') from jsonb_array_elements(r -> 'skipped') x),
    array['invalid_code'], 'skips reported');
  perform tests.eq((select slug from public.products where erp_code = '900001'), 'scopa-citta-xl-900001', 'slug from name and code');
  perform tests.eq(tests.stock('LU1', '900001'), 5, 'stock from the ERP');
  perform tests.eq((select path from public.product_images where product_id = tests.product('900001')), 'https://img.example.com/8001234567890.jpg', 'photo URL stored');
  perform tests.eq((select weight_g from public.products where erp_code = '900002'), null::integer, 'no weight yet');
  perform tests.eq((select inv.erp_quantity from public.inventory inv where inv.store_id = tests.store('LU1') and inv.product_id = tests.product('900001')), 5, 'erp quantity kept');
end $$;

-- Checkout charges the store promo price.
select tests.login('00000000-0000-0000-0000-00000000000a');
set role authenticated;
do $$
declare q jsonb; r jsonb;
begin
  q := public.quote_cart(tests.cart('LU1', 'store', '{"900001": 2}'));
  perform tests.eq((q -> 'lines' -> 0 ->> 'unit_price_cents')::int, 299, 'quote uses the store promo');
  perform tests.eq((q ->> 'subtotal_cents')::int, 598, 'subtotal at promo price');
  r := public.create_order(tests.cart('LU1', 'store', '{"900001": 2}'));
  perform tests.eq((select unit_price_cents from public.order_items where order_id = (r ->> 'id')::uuid), 299, 'order line at promo price');
  perform set_config('tests.order_id', r ->> 'id', false);
end $$;
reset role;

do $$
declare v_id uuid := current_setting('tests.order_id')::uuid; r jsonb;
begin
  perform tests.eq(tests.stock('LU1', '900001'), 3, 'order reserves stock');
  -- Next sync still reports 5 (the till does not know the online order): 5 - 2 pending = 3.
  r := public.erp_apply_batch(jsonb_build_object('store_code', 'LU1', 'sent_at', now(),
    'store_items', jsonb_build_array(jsonb_build_object('erp_code', '900001', 'price_cents', 349, 'quantity', 5))));
  perform tests.eq(tests.stock('LU1', '900001'), 3, 'unregistered online order stays out of stock');
  perform tests.eq((select price_cents from public.products where erp_code = '900001') in (349, 399), true, 'display price refreshed or other main store');
  -- An older batch arriving late is ignored.
  r := public.erp_apply_batch(jsonb_build_object('store_code', 'LU1', 'sent_at', now() - interval '1 hour',
    'store_items', jsonb_build_array(jsonb_build_object('erp_code', '900001', 'price_cents', 100, 'quantity', 50))));
  perform tests.eq((r ->> 'stale')::int, 1, 'stale row counted');
  perform tests.eq(tests.stock('LU1', '900001'), 3, 'stale row ignored');
  perform public.mark_order_paid(v_id, 'cs_erp', 'pi_erp', (select total_cents from public.orders where id = v_id));
end $$;

-- Store staff of LU1 registers the order at the till; the next sync (ERP now 3) leaves 3 sellable.
select tests.login('00000000-0000-0000-0000-0000000000c1');
set role authenticated;
do $$
declare v_id uuid := current_setting('tests.order_id')::uuid;
begin
  perform tests.ok((public.set_pos_registered(v_id, true)).pos_registered_at is not null, 'staff registers at the till');
end $$;
reset role;

do $$
declare r jsonb;
begin
  r := public.erp_apply_batch(jsonb_build_object('store_code', 'LU1', 'sent_at', now(),
    'store_items', jsonb_build_array(jsonb_build_object('erp_code', '900001', 'price_cents', 349, 'quantity', 3))));
  perform tests.eq(tests.stock('LU1', '900001'), 3, 'registered order no longer subtracted');
  perform tests.eq(public.pos_pending_quantity(tests.store('LU1'), tests.product('900001')), 0, 'nothing pending');
end $$;

-- Permissions
select tests.login('00000000-0000-0000-0000-00000000000b');
set role authenticated;
do $$ begin
  perform tests.throws($q$select public.set_pos_registered(current_setting('tests.order_id')::uuid, false)$q$, 'order_not_found', 'customers cannot register');
  perform tests.throws($q$select public.erp_apply_batch('{"store_code":"LU1"}')$q$, 'permission denied', 'customers cannot sync');
end $$;
reset role;
do $$ begin
  perform tests.ok(not has_function_privilege('anon', 'public.erp_apply_batch(jsonb)', 'execute'), 'anon cannot sync');
  perform tests.ok(not has_function_privilege('authenticated', 'public.refresh_display_prices()', 'execute'), 'refresh is internal');
  perform tests.throws($q$select public.erp_apply_batch('{"store_code":"XX"}')$q$, 'invalid_store', 'unknown store');
end $$;
rollback;
