-- Club member prices: synced per store, shown on the product, charged only to Club members.
begin;

do $$
declare r jsonb; v_today date := public.shop_today();
begin
  perform tests.eq(public.member_unit_price(500, 400, null, v_today), 400, 'member price without end');
  perform tests.eq(public.member_unit_price(500, 400, v_today, v_today), 400, 'member price last day');
  perform tests.eq(public.member_unit_price(500, 400, v_today - 1, v_today), 500, 'member price ended');
  perform tests.eq(public.member_unit_price(300, 400, null, v_today), 300, 'promo lower than member price wins');
  perform tests.eq(public.member_unit_price(500, null, null, v_today), 500, 'no member price');

  r := public.erp_apply_batch(jsonb_build_object('store_code', 'LU1', 'sent_at', now() - interval '1 minute',
    'products', jsonb_build_array(
      jsonb_build_object('erp_code', '910001', 'name', 'Trapunta soci', 'vat_rate', 22, 'price_cents', 2999, 'weight_g', 1500),
      jsonb_build_object('erp_code', '910002', 'name', 'Copriletto soci a tempo', 'vat_rate', 22, 'price_cents', 1799, 'weight_g', 900)),
    'store_items', jsonb_build_array(
      jsonb_build_object('erp_code', '910001', 'price_cents', 2999, 'member_price_cents', 2499, 'quantity', 5),
      jsonb_build_object('erp_code', '910002', 'price_cents', 1799, 'member_price_cents', 1499,
        'member_price_ends_on', v_today + 3, 'quantity', 5))));
  perform tests.eq((r ->> 'created')::int, 2, 'products created');
  perform tests.eq((select member_price_cents from public.inventory where store_id = tests.store('LU1') and product_id = tests.product('910002')), 1499, 'member price stored');
  perform tests.eq((select member_price_ends_on from public.inventory where store_id = tests.store('LU1') and product_id = tests.product('910002')), v_today + 3, 'end date stored');

  -- A row without the key keeps the member price; an explicit null removes it.
  r := public.erp_apply_batch(jsonb_build_object('store_code', 'LU1', 'sent_at', now(),
    'store_items', jsonb_build_array(jsonb_build_object('erp_code', '910001', 'price_cents', 2999, 'quantity', 5))));
  perform tests.eq((select member_price_cents from public.inventory where store_id = tests.store('LU1') and product_id = tests.product('910001')), 2499, 'absent key keeps member price');
  r := public.erp_apply_batch(jsonb_build_object('store_code', 'LU1', 'sent_at', now(),
    'store_items', jsonb_build_array(jsonb_build_object('erp_code', '910002', 'price_cents', 1799, 'member_price_cents', 1499,
      'member_price_ends_on', v_today + 3, 'quantity', 5))));

  -- Listing copy follows the main online store (LU1 only if it is the main one).
  insert into public.inventory (store_id, product_id, quantity, price_cents, member_price_cents, member_price_ends_on)
  select s.id, x.pid, 5, x.price, x.member, x.ends from public.stores s,
    (values (tests.product('910001'), 2999, 2499, null::date), (tests.product('910002'), 1799, 1499, v_today + 3)) x(pid, price, member, ends)
  where s.active
  on conflict (store_id, product_id) do update set price_cents = excluded.price_cents,
    member_price_cents = excluded.member_price_cents, member_price_ends_on = excluded.member_price_ends_on;
  perform public.refresh_display_prices();
  perform tests.eq((select member_price_cents from public.products where erp_code = '910001'), 2499, 'listing member price');
  perform tests.eq((select member_price_ends_on from public.products where erp_code = '910002'), v_today + 3, 'listing member price end');
  update public.inventory set member_price_ends_on = v_today - 1 where product_id = tests.product('910002');
  perform public.refresh_display_prices();
  perform tests.eq((select member_price_cents from public.products where erp_code = '910002'), null::integer, 'expired member price hidden');
  perform tests.eq((select on_offer from public.products where erp_code = '910002'), false, 'expired member price: not on offer');
  perform tests.eq((select on_offer from public.products where erp_code = '910001'), true, 'member price: on offer');
  update public.inventory set member_price_ends_on = v_today + 3 where product_id = tests.product('910002');
  perform public.refresh_display_prices();
end $$;

-- Customer A is not in the Club: regular price, savings available reported.
select tests.login('00000000-0000-0000-0000-00000000000a');
set role authenticated;
do $$
declare q jsonb; r jsonb;
begin
  perform public.set_club_membership(false);
  q := public.quote_cart(tests.cart('LU1', 'store', '{"910001": 2, "910002": 1}'));
  perform tests.eq((q ->> 'subtotal_cents')::int, 2999 * 2 + 1799, 'non-member pays the regular price');
  perform tests.eq((q ->> 'member_savings_available_cents')::int, 500 * 2 + 300, 'savings a member would get');
  perform tests.eq((q ->> 'member_savings_cents')::int, 0, 'no savings applied');
  perform tests.eq((select bool_or((l ->> 'member_price_applied')::boolean) from jsonb_array_elements(q -> 'lines') l), false, 'no line at member price');

  -- After joining the Club the member price is charged, also on the order.
  perform public.join_club('Cliente A', '+39 333 123 4567', true);
  q := public.quote_cart(tests.cart('LU1', 'store', '{"910001": 2, "910002": 1}'));
  perform tests.eq((q ->> 'subtotal_cents')::int, 2499 * 2 + 1499, 'member pays the member price');
  perform tests.eq((q ->> 'member_savings_cents')::int, 1300, 'member savings');
  perform tests.eq((q ->> 'member_savings_available_cents')::int, 0, 'nothing more to save');
  r := public.create_order(tests.cart('LU1', 'store', '{"910001": 1}'));
  perform tests.eq((select unit_price_cents from public.order_items where order_id = (r ->> 'id')::uuid), 2499, 'order line at member price');
  perform public.set_club_membership(false);
end $$;
reset role;

-- Guests (anon) see the regular price.
select tests.login(null, 'anon');
set role anon;
do $$
declare q jsonb;
begin
  q := public.quote_cart(tests.cart('LU1', 'store', '{"910001": 1}'));
  perform tests.eq((q ->> 'subtotal_cents')::int, 2999, 'guest pays the regular price');
  perform tests.eq((q ->> 'member_savings_available_cents')::int, 500, 'guest sees what joining saves');
end $$;
reset role;
rollback;
