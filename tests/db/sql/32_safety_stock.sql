-- Safety stock: the last units on the shelf are not sold online (owner 18/11/2026).
begin;
do $$
declare v_cat uuid; v_parent uuid; v_p uuid; v_other uuid;
begin
  insert into public.categories (slug, name, sort) values ('zsafe', 'Zsafe', 95) returning id into v_parent;
  insert into public.categories (slug, name, sort, parent_id) values ('zsafe-sub', 'Zsafe sub', 1, v_parent) returning id into v_cat;
  perform public.erp_apply_batch(jsonb_build_object('store_code', 'LU1', 'sent_at', now(),
    'products', jsonb_build_array(
      jsonb_build_object('erp_code', '980001', 'name', 'Zsafe uno', 'vat_rate', 22, 'price_cents', 500, 'weight_g', 10),
      jsonb_build_object('erp_code', '980002', 'name', 'Zsafe due', 'vat_rate', 22, 'price_cents', 500, 'weight_g', 10)),
    'store_items', jsonb_build_array(
      jsonb_build_object('erp_code', '980001', 'price_cents', 500, 'quantity', 3),
      jsonb_build_object('erp_code', '980002', 'price_cents', 500, 'quantity', 1))));
  v_p := tests.product('980001'); v_other := tests.product('980002');
  update public.products set category_id = v_cat where id in (v_p, v_other);

  -- Off in the other suites (helpers): everything is sellable.
  perform tests.eq((select sellable from public.inventory where product_id = v_p and store_id = tests.store('LU1')), 3, 'no reserve: all 3');

  -- The shop default.
  update public.app_settings set safety_stock = 1;
  perform tests.eq((select sellable from public.inventory where product_id = v_p and store_id = tests.store('LU1')), 2, 'default 1: 2 sellable');
  perform tests.eq((select sellable from public.inventory where product_id = v_other and store_id = tests.store('LU1')), 0, 'the last piece is not sold');
  perform tests.eq((select quantity from public.inventory where product_id = v_other and store_id = tests.store('LU1')), 1, 'the real quantity is kept');

  -- The parent category, then the subcategory, then the product override it.
  update public.categories set safety_stock = 2 where id = v_parent;
  perform tests.eq((select sellable from public.inventory where product_id = v_p and store_id = tests.store('LU1')), 1, 'parent category: 2 kept');
  update public.categories set safety_stock = 0 where id = v_cat;
  perform tests.eq((select sellable from public.inventory where product_id = v_p and store_id = tests.store('LU1')), 3, 'subcategory: none kept');
  update public.products set safety_stock = 3 where id = v_p;
  perform tests.eq((select sellable from public.inventory where product_id = v_p and store_id = tests.store('LU1')), 0, 'product: 3 kept');
  update public.products set safety_stock = null where id = v_p;
  update public.categories set safety_stock = null where id in (v_cat, v_parent);

  -- Stock arriving from the ERP follows the rule.
  perform public.erp_apply_batch(jsonb_build_object('store_code', 'LU1', 'sent_at', now(),
    'products', jsonb_build_array(jsonb_build_object('erp_code', '980001', 'name', 'Zsafe uno', 'vat_rate', 22, 'price_cents', 500, 'weight_g', 10)),
    'store_items', jsonb_build_array(jsonb_build_object('erp_code', '980001', 'price_cents', 500, 'quantity', 6))));
  perform tests.eq((select sellable from public.inventory where product_id = v_p and store_id = tests.store('LU1')), 5, 'ERP update: 6 - 1');
end $$;

-- Customers can order only what is sellable; the order takes from the real quantity.
select tests.login('00000000-0000-0000-0000-00000000000a');
do $$ declare q jsonb; r jsonb; begin
  q := public.quote_cart(tests.cart('LU1', 'store', '{"980001": 6}'));
  perform tests.ok(q::text like '%insufficient_stock%', 'quote: the reserve cannot be ordered');
  perform tests.throws($q$select public.create_order(tests.cart('LU1', 'store', '{"980001": 6}'))$q$, 'insufficient_stock|cart_has_issues', 'order beyond the reserve refused');
  r := public.create_order(tests.cart('LU1', 'store', '{"980001": 5}'));
  perform tests.ok(r ->> 'id' is not null, 'order up to the sellable quantity');
  perform tests.eq((select quantity from public.inventory where product_id = tests.product('980001') and store_id = tests.store('LU1')), 1, 'one left on the shelf');
  perform tests.eq((select sellable from public.inventory where product_id = tests.product('980001') and store_id = tests.store('LU1')), 0, 'nothing more online');
  perform tests.ok(not exists (select 1 from public.search_products('zsafe uno', tests.store('LU1')) s
    join lateral (select 1 from public.inventory i where i.product_id = s.product_id and i.sellable > 0 and i.store_id = tests.store('LU1')) x on true), 'search sees it out of stock');
end $$;

-- Only managers change the rule.
set role authenticated;
do $$ begin
  update public.app_settings set safety_stock = 9;
  perform tests.ok((select safety_stock from public.app_settings) = 1, 'a customer cannot change the default');
end $$;
reset role;
rollback;
