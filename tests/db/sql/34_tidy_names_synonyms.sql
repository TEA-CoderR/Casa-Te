-- Product-name format cleanup and the reviewed search synonyms (21/11/2026).
begin;
do $$ begin
  perform tests.eq(public.tidy_product_name('Panca Pieghevole Cm. 180x28x44h'), 'Panca Pieghevole 180×28×44 cm', 'cm in front');
  perform tests.eq(public.tidy_product_name('Cassett 5cass 37*29*83 cm Qbc9002la'), 'Cassett 5cass 37×29×83 cm', 'cm after, code after cm dropped');
  perform tests.eq(public.tidy_product_name('Scaffale Pro Nero 60x30x95'), 'Scaffale Pro Nero 60×30×95', 'no unit added');
  perform tests.eq(public.tidy_product_name('Paracolpi per Sedili Wc H 45x16x9 mm (4 pz Bli)'), 'Paracolpi per Sedili Wc H 45x16x9 mm (4 pz Bli)', 'mm left alone');
  perform tests.eq(public.tidy_product_name('Cartella Elastico Piatto Dorso 3 cm 35x2'), 'Cartella Elastico Piatto Dorso 3 cm 35x2', 'cm after a number stays with it');
  perform tests.eq(public.tidy_product_name('Last Piatti 950 ml Limone C0006'), 'Last Piatti 950 ml Limone', 'supplier code');
  perform tests.eq(public.tidy_product_name('Pouf Tdo L. Grig. 28*27 cm Yd-19803-A'), 'Pouf Tdo L. Grig. 28×27 cm', 'hyphen code');
  perform tests.eq(public.tidy_product_name('Cuoca Stone Padella 22 cm 9908'), 'Cuoca Stone Padella 22 cm', 'number after cm');
  perform tests.eq(public.tidy_product_name('Velvet Skin Loose Powder 0003'), 'Velvet Skin Loose Powder 0003', 'shade number kept');
  perform tests.eq(public.tidy_product_name('Special Dog Crocchette Agnello/Riso 4000'), 'Special Dog Crocchette Agnello/Riso 4000', 'weight kept');
  perform tests.eq(public.tidy_product_name('Bibo Tovaglia CAR. Damas. ROT120X700CMBLU'), 'Bibo Tovaglia CAR. Damas. ROT120X700CMBLU', 'code with a size kept');
  perform tests.eq(public.tidy_product_name('Sedile Wc Selnova3 Polytech Bianco'), 'Sedile Wc Selnova 3 Polytech Bianco', 'glued number');
  perform tests.eq(public.tidy_product_name('Winni Gel lavastoviglie Allin1 Aceto'), 'Winni Gel lavastoviglie Allin1 Aceto', 'Allin1 kept');
  perform tests.eq(public.tidy_product_name('Felix Bust. 4X85 Extra Manzo/pollo C0175'), 'Felix Bust. 4X85 Extra Manzo/pollo', 'pack count kept');
  perform tests.eq(public.tidy_product_name('Last Piatti 950 ml Limone C0006', false), 'Last Piatti 950 ml Limone C0006', 'codes kept on request');
end $$;

-- New ERP products are tidied; the code stays when another product already has the tidy name.
do $$ begin
  perform public.erp_apply_batch(jsonb_build_object('store_code', 'LU1', 'sent_at', now(),
    'products', jsonb_build_array(
      jsonb_build_object('erp_code', '990001', 'name', 'Zmobile 3 Cass. 26*32*62 cm Sy833-3s', 'vat_rate', 22, 'price_cents', 900, 'weight_g', 10),
      jsonb_build_object('erp_code', '990002', 'name', 'Zmobile 3 Cass. 26*32*62 cm Sy125-3', 'vat_rate', 22, 'price_cents', 900, 'weight_g', 10)),
    'store_items', jsonb_build_array()));
  perform tests.eq((select name from public.products where sku = '990001'), 'Zmobile 3 Cass. 26×32×62 cm', 'new product tidied');
  perform tests.eq((select name from public.products where sku = '990002'), 'Zmobile 3 Cass. 26×32×62 cm Sy125-3', 'second one keeps its code');
  perform tests.eq((select erp_name from public.products where sku = '990002'), 'Zmobile 3 Cass. 26*32*62 cm Sy125-3', 'ERP text kept');
end $$;

-- Synonyms.
do $$ begin
  perform tests.eq((select expands_to from public.search_synonyms where term = 'varechina'), 'candeggina', 'varechina');
  perform tests.eq((select expands_to from public.search_synonyms where term = 'sacchi spazzatura'), 'spazzatura', 'garbage bags');
  perform tests.ok(not exists (select 1 from public.search_synonyms where term <> public.search_fold(term)), 'terms are folded');
end $$;
rollback;
