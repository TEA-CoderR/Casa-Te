-- Products without a weight can be collected in store but not shipped until a weight is set.
begin;
do $$
declare q jsonb;
begin
  perform public.erp_apply_batch(jsonb_build_object('store_code', 'LU1',
    'products', jsonb_build_array(jsonb_build_object('erp_code', '910001', 'name', 'Vaso senza peso', 'price_cents', 500)),
    'store_items', jsonb_build_array(jsonb_build_object('erp_code', '910001', 'price_cents', 500, 'quantity', 4))));
  q := public.quote_cart(tests.cart('LU1', 'store', '{"910001": 1, "carta-cucina": 1}'));
  perform tests.eq((q ->> 'weight_missing')::boolean, true, 'weight missing flagged');
  perform tests.ok(q -> 'shipping' -> 'home' = 'null'::jsonb, 'no home delivery without weight');
  perform tests.ok(q -> 'shipping' -> 'pickup' = 'null'::jsonb, 'no pickup point without weight');
  perform tests.eq((q -> 'shipping' -> 'store' ->> 'price_cents')::int, 0, 'store pickup available and free');
  perform tests.eq((q ->> 'total_cents')::int, 500 + (select price_cents from public.products where sku = 'carta-cucina'), 'total = goods');
  perform tests.eq((select weight_g from jsonb_to_recordset(q -> 'lines') as x(sku text, weight_g int) where sku = '910001'), 0, 'line weight 0 when unknown');
  update public.products set weight_g = 800 where erp_code = '910001';
  q := public.quote_cart(tests.cart('LU1', 'home', '{"910001": 1}'));
  perform tests.eq((q ->> 'weight_missing')::boolean, false, 'weight set');
  perform tests.ok(q -> 'shipping' -> 'home' <> 'null'::jsonb, 'home delivery available again');
  -- Deactivation-only row keeps the VAT rate.
  update public.products set vat_rate = 10 where erp_code = '910001';
  perform public.erp_apply_batch('{"store_code":"LU1","products":[{"erp_code":"910001","active":false}]}');
  perform tests.eq((select vat_rate::int || '/' || active::text from public.products where erp_code = '910001'), '10/false', 'partial row keeps VAT, deactivates');
  update public.products set active = true where erp_code = '910001';
end $$;

update public.products set weight_g = null where erp_code = '910001';
select tests.login('00000000-0000-0000-0000-00000000000a');
set role authenticated;
do $$
declare r jsonb;
begin
  r := public.create_order(tests.cart('LU1', 'store', '{"910001": 2}'));
  perform tests.eq((select weight_g from public.order_items where order_id = (r ->> 'id')::uuid), 0, 'pickup order without weight placed');
  perform tests.throws($q$select public.create_order(tests.cart('LU1', 'home', '{"910001": 1}',
    '{"address":{"full_name":"Anna","line1":"Via Roma 1","city":"Lucca","province":"LU","postal_code":"55100","phone":"3331234567"}}'))$q$,
    'shipping_unavailable', 'home delivery refused without weight');
end $$;
reset role;
rollback;
