-- Cart suggestions: in stock, with a photo, not in the cart, complements and offers first, 2 per subcategory.
begin;
do $$
declare v_dep uuid; v_a uuid; v_b uuid; v_other uuid; r uuid[];
begin
  insert into public.categories (slug, name, sort) values ('zs-dep', 'ZS Reparto', 9100) returning id into v_dep;
  insert into public.categories (slug, name, sort, parent_id) values ('zs-a', 'ZS A', 1, v_dep) returning id into v_a;
  insert into public.categories (slug, name, sort, parent_id) values ('zs-b', 'ZS B', 2, v_dep) returning id into v_b;
  insert into public.categories (slug, name, sort) values ('zs-other', 'ZS Altro', 9200) returning id into v_other;
  perform public.erp_apply_batch(jsonb_build_object('store_code', 'LU1', 'sent_at', now(),
    'products', (select jsonb_agg(jsonb_build_object('erp_code', (940000 + g)::text, 'name', 'Sugg ' || g, 'vat_rate', 22,
      'price_cents', 300 + g, 'weight_g', 10)) from generate_series(1, 8) g),
    'store_items', (select jsonb_agg(jsonb_build_object('erp_code', (940000 + g)::text, 'price_cents', 300 + g,
      'quantity', case when g = 6 then 0 else 5 end)) from generate_series(1, 8) g)));
  -- 1 in cart (A); 2,3,4 in B (complements); 5 in A; 6 in B but out of stock; 7 elsewhere, no offer; 8 elsewhere without photo
  update public.products set category_id = v_a where erp_code in ('940001', '940005');
  update public.products set category_id = v_b where erp_code in ('940002', '940003', '940004', '940006');
  update public.products set category_id = v_other where erp_code in ('940007', '940008');
  insert into public.product_images (product_id, path, sort)
    select id, 'test/' || erp_code || '.jpg', 0 from public.products where erp_code between '940001' and '940007';

  select array_agg(product_id) into r from public.cart_suggestions(tests.store('LU1'), array[tests.product('940001')], 10);
  perform tests.ok(not (tests.product('940001') = any(r)), 'cart product not suggested');
  perform tests.ok(not (tests.product('940006') = any(r)), 'out of stock not suggested');
  perform tests.ok(not (tests.product('940007') = any(r)), 'unrelated product without offer not suggested');
  perform tests.ok(not (tests.product('940008') = any(r)), 'product without photo not suggested');
  perform tests.eq((select count(*)::int from unnest(r) x where x in (tests.product('940002'), tests.product('940003'), tests.product('940004'))), 2, 'at most 2 per subcategory');
  perform tests.ok(r[1] in (tests.product('940002'), tests.product('940003'), tests.product('940004')), 'complements (same department, other subcategory) first');
  perform tests.eq((select count(*)::int from public.cart_suggestions(tests.store('LU1'), '{}', 10)), 0, 'empty cart: nothing');
end $$;

select tests.login(null, 'anon');
set role anon;
do $$ begin
  perform tests.ok((select count(*) >= 0 from public.cart_suggestions(null, '{}', 5)), 'guests can call it');
end $$;
reset role;
rollback;
