-- Search order: in stock first, then name matches; every word must appear; accents ignored.
begin;
do $$
declare r uuid[];
begin
  perform public.erp_apply_batch(jsonb_build_object('store_code', 'LU1', 'sent_at', now(),
    'products', jsonb_build_array(
      jsonb_build_object('erp_code', '950001', 'name', 'Zqx Maschera Zcaffeina', 'vat_rate', 22, 'price_cents', 300, 'weight_g', 10),
      jsonb_build_object('erp_code', '950002', 'name', 'Tazzine Zcaffe’ Blu', 'vat_rate', 22, 'price_cents', 300, 'weight_g', 10),
      jsonb_build_object('erp_code', '950003', 'name', 'Zcaffettiera Rossa 3 tazze', 'vat_rate', 22, 'price_cents', 300, 'weight_g', 10),
      jsonb_build_object('erp_code', '950004', 'name', 'Zcaffettiera Blu 6 tazze', 'vat_rate', 22, 'price_cents', 300, 'weight_g', 10)),
    'store_items', jsonb_build_array(
      jsonb_build_object('erp_code', '950001', 'price_cents', 300, 'quantity', 5),
      jsonb_build_object('erp_code', '950002', 'price_cents', 300, 'quantity', 5),
      jsonb_build_object('erp_code', '950003', 'price_cents', 300, 'quantity', 5),
      jsonb_build_object('erp_code', '950004', 'price_cents', 300, 'quantity', 0))));

  select array_agg(product_id) into r from public.search_products('zcaffè', tests.store('LU1'));
  perform tests.eq(cardinality(r), 4, 'accented query finds all four');
  perform tests.eq(r[1], tests.product('950003'), 'in stock, name starts with the text: first');
  perform tests.eq(r[2], tests.product('950002'), 'whole word: second');
  perform tests.eq(r[3], tests.product('950001'), 'start of a later word: after whole words');
  perform tests.eq(r[4], tests.product('950004'), 'out of stock: last');
  select array_agg(product_id) into r from public.search_products('blu zcaff', tests.store('LU1'));
  perform tests.eq(cardinality(r), 2, 'every word must appear, in any order');
  perform tests.eq((select total from public.search_products('zcaff', tests.store('LU1'), null, false, 1, 0)), 4::bigint, 'total counts every hit');
  perform tests.eq((select count(*)::int from public.search_products('   ', tests.store('LU1'))), 0, 'blank query: nothing');
end $$;
rollback;
