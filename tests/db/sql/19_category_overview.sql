-- Department counts and covers come from the database, not from a capped client query.
begin;
do $$
declare v_cat uuid; r record;
begin
  insert into public.categories (slug, name) values ('test-overview', 'Test overview') returning id into v_cat;
  perform public.erp_apply_batch(jsonb_build_object('store_code', 'LU1', 'sent_at', now(),
    'products', (select jsonb_agg(jsonb_build_object('erp_code', (920000 + g)::text, 'name', 'Overview ' || g, 'vat_rate', 22, 'price_cents', 100, 'weight_g', 10))
      from generate_series(1, 1200) g),
    'store_items', (select jsonb_agg(jsonb_build_object('erp_code', (920000 + g)::text, 'price_cents', 100, 'quantity', case when g <= 1100 then 3 else 0 end))
      from generate_series(1, 1200) g)));
  update public.products set category_id = v_cat where erp_code between '920001' and '921200';
  insert into public.product_images (product_id, path, sort) values (tests.product('920500'), 'test/overview.jpg', 0);

  select * into r from public.category_overview() where category_id = v_cat;
  perform tests.eq(r.products, 1100, 'counts every product in stock, beyond 1000 rows');
  perform tests.eq(r.cover_path, 'test/overview.jpg', 'a product with a photo is the cover');
  select * into r from public.category_overview(array[(select sku from public.products where erp_code = '920500')]) where category_id = v_cat;
  perform tests.eq(r.cover_path, 'test/overview.jpg', 'an avoided product is still used when it is the only photo');

  -- A cover chosen by hand wins, also for a department without products of its own; out of stock it falls back.
  insert into public.product_images (product_id, path, sort) values (tests.product('920600'), 'test/chosen.jpg', 0);
  update public.categories set cover_product_id = tests.product('920600') where id = v_cat;
  select * into r from public.category_overview() where category_id = v_cat;
  perform tests.eq(r.cover_path, 'test/chosen.jpg', 'the chosen cover is used');
  perform tests.eq(r.products, 1100, 'the count is unchanged by the chosen cover');
  declare v_dept uuid; begin
    insert into public.categories (slug, name, cover_product_id) values ('test-overview-dept', 'Test dept', tests.product('920600')) returning id into v_dept;
    select * into r from public.category_overview() where category_id = v_dept;
    perform tests.eq(r.cover_path, 'test/chosen.jpg', 'a department without products gets its chosen cover');
    perform tests.eq(r.products, 0, 'a department without products counts none of its own');
  end;
  update public.inventory set quantity = 0 where product_id = tests.product('920600');
  select * into r from public.category_overview() where category_id = v_cat;
  perform tests.eq(r.cover_path, 'test/overview.jpg', 'an out-of-stock chosen cover falls back to the automatic one');
end $$;

select tests.login(null, 'anon');
set role anon;
do $$ begin
  perform tests.eq((select count(*) > 0 from public.category_overview()), true, 'guests can read the overview');
end $$;
reset role;
rollback;
