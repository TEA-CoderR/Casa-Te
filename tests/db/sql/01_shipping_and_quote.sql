-- Shipping parity (SQL vs shared TS vs approved demo rules) and quote_cart behaviour.
begin;

do $$
declare c jsonb; v_price integer; n integer := 0;
begin
  for c in select * from jsonb_array_elements(current_setting('tests.shipping_cases')::jsonb) loop
    select price_cents into v_price
    from public.shipping_cost_cents(c ->> 'method', (c ->> 'subtotal')::int, (c ->> 'weight')::int);
    perform tests.eq(v_price, (c ->> 'expected')::int,
      format('shipping %s subtotal=%s weight=%s', c ->> 'method', c ->> 'subtotal', c ->> 'weight'));
    n := n + 1;
  end loop;
  perform tests.ok(n > 400, 'parity fixture loaded');
end $$;

set role anon;
select tests.logout();

do $$
declare q jsonb;
begin
  -- 7 x €9,99 / 0,8 kg = €69,93, 5,6 kg -> free shipping (demo acceptance S-free).
  q := public.quote_cart(tests.cart('LU1', 'home', '{"contenitori-cucina": 7}'));
  perform tests.eq((q ->> 'subtotal_cents')::int, 6993, 'subtotal 7 x 999');
  perform tests.eq((q ->> 'total_weight_g')::int, 5600, 'weight 7 x 800');
  perform tests.eq((q ->> 'shipping_cents')::int, 0, 'free shipping >= €66 and <= 10 kg');
  perform tests.eq((q ->> 'total_cents')::int, 6993, 'total equals subtotal when free');

  -- 10 x 1,1 kg = 11 kg -> provisional overweight rate even above €66.
  q := public.quote_cart(tests.cart('LU1', 'pickup', '{"padella-28": 10}'));
  perform tests.eq((q ->> 'shipping_cents')::int, 990, 'overweight pickup rate');
  perform tests.eq((q -> 'shipping' -> 'home' ->> 'price_cents')::int, 1290, 'overweight home rate');
  perform tests.eq((q -> 'shipping' -> 'home' ->> 'provisional')::boolean, true, 'overweight flagged provisional');

  -- Store pickup always free.
  q := public.quote_cart(tests.cart('AR1', 'store', '{"carta-cucina": 1}'));
  perform tests.eq((q ->> 'shipping_cents')::int, 0, 'store pickup free');
  perform tests.eq((q ->> 'total_cents')::int, 499, 'store total');

  -- Duplicate product lines are merged.
  q := public.quote_cart(jsonb_build_object('store_id', tests.store('LU1'), 'items', jsonb_build_array(
    jsonb_build_object('product_id', tests.product('carta-cucina'), 'quantity', 1),
    jsonb_build_object('product_id', tests.product('carta-cucina'), 'quantity', 2))));
  perform tests.eq((q -> 'lines' -> 0 ->> 'quantity')::int, 3, 'duplicate lines merged');
  perform tests.eq(q ->> 'total_cents', null, 'no total without fulfilment');

  -- Issues: insufficient stock, invalid quantity, unknown product.
  q := public.quote_cart(tests.cart('LU1', 'home', '{"carta-cucina": 26}'));
  perform tests.eq(q -> 'lines' -> 0 ->> 'issue', 'insufficient_stock', 'stock issue');
  perform tests.eq((q ->> 'issue_count')::int, 1, 'issue counted');
  perform tests.eq((q ->> 'subtotal_cents')::int, 0, 'lines with issues excluded from subtotal');
  q := public.quote_cart(tests.cart('LU1', 'home', '{"carta-cucina": 0}'));
  perform tests.eq(q -> 'lines' -> 0 ->> 'issue', 'invalid_quantity', 'zero quantity');
  q := public.quote_cart(jsonb_build_object('store_id', tests.store('LU1'), 'items',
    jsonb_build_array(jsonb_build_object('product_id', gen_random_uuid(), 'quantity', 1))));
  perform tests.eq(q -> 'lines' -> 0 ->> 'issue', 'unavailable', 'unknown product');

  perform tests.throws($q$select public.quote_cart('{"store_id":"nope","items":[{"product_id":"x","quantity":1}]}')$q$,
    'invalid_store', 'bad store id');
  perform tests.throws($q$select public.quote_cart(jsonb_build_object('store_id', tests.store('LU1'), 'items', '[]'::jsonb))$q$,
    'empty_cart', 'empty cart');
  perform tests.throws($q$select public.quote_cart(jsonb_build_object('store_id', tests.store('LU1'),
    'items', '[{"product_id":"not-a-uuid","quantity":1}]'::jsonb))$q$, 'invalid_items', 'malformed product id');

  -- Coupon: 10% on €25,98 -> €2,60 off; bands use discounted value (€23,38 -> < €25 band).
  q := public.quote_cart(tests.cart('LU1', 'home', '{"padella-28": 2}', '{"coupon_code":"benvenuto10"}'));
  perform tests.eq((q ->> 'discount_cents')::int, 260, 'percent coupon');
  perform tests.eq((q ->> 'shipping_cents')::int, 690, 'band from discounted subtotal (< €25, 2-5 kg)');
  perform tests.eq((q ->> 'total_cents')::int, 2598 - 260 + 690, 'total with coupon');
  q := public.quote_cart(tests.cart('LU1', 'home', '{"carta-cucina": 1}', '{"coupon_code":"BENVENUTO10"}'));
  perform tests.eq(q ->> 'coupon_error', 'coupon_min_subtotal', 'coupon minimum');
  q := public.quote_cart(tests.cart('LU1', 'home', '{"carta-cucina": 1}', '{"coupon_code":"NONESISTE"}'));
  perform tests.eq(q ->> 'coupon_error', 'coupon_not_found', 'unknown coupon');
end $$;

-- Disabling home delivery for a store removes the option.
reset role;
update public.stores set ships_orders = false where code = 'LU4';
update public.pickup_points set active = false;
set role anon;
do $$
declare q jsonb;
begin
  q := public.quote_cart(tests.cart('LU4', 'home', '{"carta-cucina": 1}'));
  perform tests.eq(q -> 'shipping' -> 'home', 'null'::jsonb, 'home unavailable when store does not ship');
  perform tests.eq(q ->> 'total_cents', null, 'no total for unavailable method');
  q := public.quote_cart(tests.cart('LU1', 'pickup', '{"carta-cucina": 1}'));
  perform tests.eq(q -> 'shipping' -> 'pickup', 'null'::jsonb, 'pickup unavailable without pickup points');
end $$;

reset role;
rollback;
