-- Search by category words, singular/plural, synonyms and close spellings (plan v3 L1).
begin;
do $$
declare r uuid[]; v_parent uuid; v_cat uuid; v_svelto uuid; v_igienica uuid;
begin
  insert into public.categories (slug, name, sort) values ('zdetersivi', 'Zdetersivi', 90) returning id into v_parent;
  insert into public.categories (slug, name, sort, parent_id) values ('zdetersivi-piatti', 'Zdetersivi piatti', 1, v_parent) returning id into v_cat;
  perform public.erp_apply_batch(jsonb_build_object('store_code', 'LU1', 'sent_at', now(),
    'products', jsonb_build_array(
      jsonb_build_object('erp_code', '960001', 'name', 'Zvelto Limone 1 l', 'vat_rate', 22, 'price_cents', 300, 'weight_g', 10),
      jsonb_build_object('erp_code', '960002', 'name', 'Zcarta Zigienica 4 rotoli', 'vat_rate', 22, 'price_cents', 300, 'weight_g', 10),
      jsonb_build_object('erp_code', '960003', 'name', 'Zshampoo Delicato 250 ml', 'vat_rate', 22, 'price_cents', 300, 'weight_g', 10)),
    'store_items', jsonb_build_array(
      jsonb_build_object('erp_code', '960001', 'price_cents', 300, 'quantity', 5),
      jsonb_build_object('erp_code', '960002', 'price_cents', 300, 'quantity', 5),
      jsonb_build_object('erp_code', '960003', 'price_cents', 300, 'quantity', 5))));
  select id into v_svelto from public.products where sku = '960001';
  select id into v_igienica from public.products where sku = '960002';
  update public.products set category_id = v_cat where id = v_svelto;
  perform tests.eq((select category_text from public.products where id = v_svelto), 'zdetersivi piatti zdetersivi', 'category names stored, folded');

  -- The category's words count, singular or plural.
  select array_agg(product_id) into r from public.search_products('zdetersivo piatti', tests.store('LU1'));
  perform tests.ok(r = array[v_svelto], 'found by the words of its category, singular for plural');
  perform tests.eq((select bool_or(fuzzy) from public.search_products('zdetersivo piatti', tests.store('LU1'))), false, 'an exact match is not fuzzy');

  -- Renaming the category follows.
  update public.categories set name = 'Zlavastoviglie' where id = v_cat;
  perform tests.eq((select count(*)::int from public.search_products('zlavastoviglie', tests.store('LU1'))), 1, 'category renamed: products follow');

  -- A synonym listed by the shop.
  insert into public.search_synonyms (term, expands_to) values ('zsciampo', 'zshampoo');
  perform tests.eq((select count(*)::int from public.search_products('zsciampo', tests.store('LU1'))), 1, 'synonym');
  perform tests.eq((select count(*)::int from public.search_products('zsciampo delicato', tests.store('LU1'))), 1, 'synonym inside a longer text');

  -- A typo finds the close spelling, marked fuzzy.
  select array_agg(product_id) into r from public.search_products('zcarta zigenica', tests.store('LU1'));
  perform tests.ok(r = array[v_igienica], 'typo: close spelling found');
  perform tests.eq((select bool_and(fuzzy) from public.search_products('zcarta zigenica', tests.store('LU1'))), true, 'and marked fuzzy');
  perform tests.eq((select count(*)::int from public.search_products('qqqqwwww', tests.store('LU1'))), 0, 'nonsense finds nothing');
end $$;

-- Customers cannot edit synonyms.
select tests.login('00000000-0000-0000-0000-00000000000a');
set role authenticated;
do $$ begin
  perform tests.throws($q$insert into public.search_synonyms (term, expands_to) values ('abc', 'def')$q$, 'row-level security|permission denied', 'synonyms are for managers');
end $$;
reset role;
rollback;
