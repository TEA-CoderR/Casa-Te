-- "Fotografa un prodotto": the text read from a pack finds the product (plan v3 X3, step 1).
begin;
do $$
declare v_lemon uuid; v_lemon_big uuid; v_mint uuid; r uuid[];
begin
  perform public.erp_apply_batch(jsonb_build_object('store_code', 'LU1', 'sent_at', now(),
    'products', jsonb_build_array(
      jsonb_build_object('erp_code', '970001', 'name', 'Zvelto Piatti Limone 930 ml', 'vat_rate', 22, 'price_cents', 300, 'weight_g', 10, 'barcode', '8001234567895'),
      jsonb_build_object('erp_code', '970002', 'name', 'Zvelto Piatti Limone 1500 ml', 'vat_rate', 22, 'price_cents', 400, 'weight_g', 10),
      jsonb_build_object('erp_code', '970003', 'name', 'Zvelto Piatti Menta 930 ml', 'vat_rate', 22, 'price_cents', 300, 'weight_g', 10),
      jsonb_build_object('erp_code', '970004', 'name', 'Zanteclair Piatti 500 ml limoneebasilico', 'vat_rate', 22, 'price_cents', 200, 'weight_g', 10),
      jsonb_build_object('erp_code', '970005', 'name', 'Zanteclair Piatti 500 ml aranciaemandorla', 'vat_rate', 22, 'price_cents', 200, 'weight_g', 10)),
    'store_items', jsonb_build_array(
      jsonb_build_object('erp_code', '970001', 'price_cents', 300, 'quantity', 5),
      jsonb_build_object('erp_code', '970002', 'price_cents', 400, 'quantity', 5),
      jsonb_build_object('erp_code', '970003', 'price_cents', 300, 'quantity', 5),
      jsonb_build_object('erp_code', '970004', 'price_cents', 200, 'quantity', 5),
      jsonb_build_object('erp_code', '970005', 'price_cents', 200, 'quantity', 5))));
  select id into v_lemon from public.products where sku = '970001';
  select id into v_lemon_big from public.products where sku = '970002';
  select id into v_mint from public.products where sku = '970003';

  -- Text as a phone reads a pack: capitals, lines, size glued to its unit, words in other languages.
  select array_agg(product_id order by score desc) into r from public.match_label_text(
    E'ZVELTO\nPIATTI\nlimone\ncon aceto\n930ml\nDishwashing liquid · Spülmittel', tests.store('LU1'));
  perform tests.eq(r[1], v_lemon, 'name and size on the pack: that product first');
  perform tests.ok(not (v_mint = any (r[1:1])), 'another scent is not first');
  perform tests.ok(v_lemon_big = any (r), 'the other size is still offered');

  -- The barcode digits printed under the bars, read in groups.
  select array_agg(product_id) into r from public.match_label_text('ingredienti … 8 001234 567895', tests.store('LU1'));
  perform tests.eq(r[1], v_lemon, 'barcode digits: exact product');
  perform tests.eq((select bool_or(exact) from public.match_label_text('8 001234 567895', tests.store('LU1'))), true, 'and marked exact');

  -- A scent glued together in the ERP name is still told apart.
  select array_agg(product_id order by score desc) into r from public.match_label_text(E'ZANTECLAIR\nPIATTI\nLimone e Basilico\n500 ml', null);
  perform tests.eq(r[1], (select id from public.products where sku = '970004'), 'glued scent name: the right one first');

  -- One shared word is not a match.
  perform tests.eq((select count(*)::int from public.match_label_text('limone fresco di Sicilia', tests.store('LU1'))), 0, 'one word alone finds nothing');
  perform tests.eq((select count(*)::int from public.match_label_text('', tests.store('LU1'))), 0, 'empty text');
  perform tests.eq((select count(*)::int from public.match_label_text(null, null)), 0, 'null text');

  -- Inactive products are never offered.
  update public.products set active = false where id = v_mint;
  perform tests.ok(not exists (select 1 from public.match_label_text('Zvelto piatti menta', null) where product_id = v_mint), 'inactive product not offered');
end $$;

-- Customers (and visitors) may call it.
set local role anon;
select tests.ok((select count(*) from public.match_label_text('Zvelto piatti limone', null)) >= 1, 'anon can match label text');
reset role;
rollback;
