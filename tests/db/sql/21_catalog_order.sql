-- Products carry the position of their category in the tree, kept up to date by triggers.
begin;
do $$
declare v_dep uuid; v_a uuid; v_b uuid;
begin
  insert into public.categories (slug, name, sort) values ('zz-reparto', 'ZZ Reparto', 9000) returning id into v_dep;
  insert into public.categories (slug, name, sort, parent_id) values ('zz-a', 'ZZ A', 20, v_dep) returning id into v_a;
  insert into public.categories (slug, name, sort, parent_id) values ('zz-b', 'ZZ B', 10, v_dep) returning id into v_b;
  perform public.erp_apply_batch(jsonb_build_object('store_code', 'LU1', 'sent_at', now(),
    'products', jsonb_build_array(
      jsonb_build_object('erp_code', '930001', 'name', 'Alfa', 'vat_rate', 22, 'price_cents', 100, 'weight_g', 10),
      jsonb_build_object('erp_code', '930002', 'name', 'Beta', 'vat_rate', 22, 'price_cents', 100, 'weight_g', 10))));
  update public.products set category_id = v_a where erp_code = '930001';
  update public.products set category_id = v_b where erp_code = '930002';

  perform tests.ok((select category_rank from public.products where erp_code = '930002')
    < (select category_rank from public.products where erp_code = '930001'), 'subcategory B (sort 10) before A (sort 20)');
  perform tests.ok((select category_rank from public.products where erp_code = '930001') is not null, 'rank set on category change');

  update public.categories set sort = 5 where id = v_a;
  perform tests.ok((select category_rank from public.products where erp_code = '930001')
    < (select category_rank from public.products where erp_code = '930002'), 'reordering subcategories updates products');

  delete from public.categories where id = v_a;
  perform tests.eq((select category_rank from public.products where erp_code = '930001'), null::integer, 'no category, no rank');
end $$;
rollback;
