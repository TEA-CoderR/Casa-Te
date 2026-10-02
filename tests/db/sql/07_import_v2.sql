-- Product import v2: subcategories, pack size, colour, highlights, variants, several images.
begin;

select tests.login('00000000-0000-0000-0000-0000000000d1');
set role authenticated;
do $$
declare r jsonb; v_rows jsonb; v_parent uuid; v_sub uuid;
begin
  v_rows := '[
    {"sku":"DIF-TES","name":"Diffusore Tessuto 500 ml","category":"Casa","subcategory":"Profumatori","price_cents":7900,"weight_g":900,
     "brand":"Marca Prova","color":"Ambra","unit":"ml","unit_quantity":500,
     "highlights":[{"icon":"drop","label":"Fragranza italiana"},{"icon":"home","label":"Per ogni ambiente"}],
     "variant_group":"Diffusore 500","variant_title":"fragranza","variant_label":"Tessuto",
     "image_urls":["https://cdn.example.com/a1.jpg","https://cdn.example.com/a2.jpg"],"stock":{"AR1":5}},
    {"sku":"DIF-ARA","name":"Diffusore Aramara 500 ml","category":"casa","subcategory":"profumatori","price_cents":7900,"weight_g":900,
     "unit":"ml","unit_quantity":500,"variant_group":"diffusore-500","variant_title":"fragranza","variant_label":"Aramara"},
    {"sku":"BAD-UNIT","name":"Solo unità","price_cents":100,"weight_g":10,"unit":"ml"},
    {"sku":"BAD-ICON","name":"Icona sconosciuta","price_cents":100,"weight_g":10,"highlights":[{"icon":"rocket","label":"x"}]},
    {"sku":"BAD-VAR","name":"Variante senza nome","price_cents":100,"weight_g":10,"variant_group":"gruppo"},
    {"sku":"BAD-SUB","name":"Sottocategoria sola","price_cents":100,"weight_g":10,"subcategory":"Orfana"}
  ]';

  r := public.admin_import_products(v_rows, true);
  perform tests.eq((r ->> 'created')::int, 2, 'dry run: two valid rows');
  perform tests.eq((r ->> 'failed')::int, 4, 'dry run: four invalid rows');
  perform tests.eq((select count(*) from public.categories where name = 'Profumatori')::int, 0, 'dry run creates no subcategory');

  r := public.admin_import_products(v_rows, false);
  perform tests.eq((r ->> 'created')::int, 2, 'import creates two products');

  select id into v_parent from public.categories where slug = 'casa';
  select id into v_sub from public.categories where name = 'Profumatori';
  perform tests.eq((select parent_id from public.categories where id = v_sub), v_parent, 'subcategory created under the existing parent');
  perform tests.eq((select count(*) from public.categories where name = 'Profumatori')::int, 1, 'subcategory matched case-insensitively, not duplicated');
  perform tests.eq((select category_id from public.products where sku = 'DIF-ARA'), v_sub, 'second row uses the same subcategory');

  perform tests.eq((select color from public.products where sku = 'DIF-TES'), 'Ambra', 'colour imported');
  perform tests.eq((select unit || unit_quantity::text from public.products where sku = 'DIF-TES'), 'ml500.000', 'pack size imported');
  perform tests.eq((select jsonb_array_length(highlights) from public.products where sku = 'DIF-TES'), 2, 'highlights imported');
  perform tests.eq((select variant_group from public.products where sku = 'DIF-ARA'), 'diffusore-500', 'variant group normalised');
  perform tests.eq((select count(*) from public.products where variant_group = 'diffusore-500')::int, 2, 'both variants in one group');
  perform tests.eq((select string_agg(path, ',' order by sort) from public.product_images i join public.products p on p.id = i.product_id where p.sku = 'DIF-TES'),
    'https://cdn.example.com/a1.jpg,https://cdn.example.com/a2.jpg', 'images imported in order');

  -- Re-import with empty optional cells keeps what is there; new images are appended once.
  r := public.admin_import_products('[{"sku":"DIF-TES","name":"Diffusore Tessuto 500 ml","price_cents":7500,"weight_g":900,
    "image_urls":["https://cdn.example.com/a2.jpg","https://cdn.example.com/a3.jpg"]}]', false);
  perform tests.eq((r ->> 'updated')::int, 1, 'second import updates');
  perform tests.eq((select price_cents from public.products where sku = 'DIF-TES'), 7500, 'price updated');
  perform tests.eq((select color from public.products where sku = 'DIF-TES'), 'Ambra', 'empty colour keeps the old one');
  perform tests.eq((select jsonb_array_length(highlights) from public.products where sku = 'DIF-TES'), 2, 'empty highlights keep the old ones');
  perform tests.eq((select variant_label from public.products where sku = 'DIF-TES'), 'Tessuto', 'empty variant keeps the old one');
  perform tests.eq((select category_id from public.products where sku = 'DIF-TES'), v_sub, 'empty category keeps the old one');
  perform tests.eq((select count(*) from public.product_images i join public.products p on p.id = i.product_id where p.sku = 'DIF-TES')::int, 3,
    'only the new image is added');
end $$;
reset role;

-- Store staff cannot import.
select tests.login('00000000-0000-0000-0000-0000000000c1');
set role authenticated;
do $$ begin
  perform tests.throws($q$select public.admin_import_products('[]'::jsonb, true)$q$, 'forbidden', 'store staff cannot import');
end $$;
reset role;

rollback;
