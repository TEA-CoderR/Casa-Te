-- Readable product names: ERP abbreviations cleaned, original kept in erp_name.
begin;
do $$ begin
  perform tests.eq(public.clean_product_name('Deox AMMORB.CONC.33 Lav.vanigliaeargan'), 'Deox ammorbidente concentrato 33 lavaggi vanigliaeargan', 'abbreviations and washes');
  perform tests.eq(public.clean_product_name('Kicco Bricco Inox 8tz. Lt.0,65'), 'Kicco Bricco Inox 8 tazze 0,65 l', 'cups and litres');
  perform tests.eq(public.clean_product_name('Sturavaso Ø150 in Gomma (Sfu)'), 'Sturavaso Ø150 in Gomma', 'supplier tag dropped');
  perform tests.eq(public.clean_product_name('Hez/Pouf Tdo L.Grig. 28*27 cm Yd-19803-A'), 'Pouf Tdo L. Grig. 28*27 cm Yd-19803-A', 'internal prefix dropped');
  perform tests.eq(public.clean_product_name('Entratina 4 Ripiani Cm.60x28x160h'), 'Entratina 4 Ripiani Cm. 60x28x160h', 'no unit moved into a code');
  perform tests.eq(public.clean_product_name('Pattini per Freni 70 mm (2 pz) Mtb'), 'Pattini per Freni 70 mm (2 pz) Mtb', 'brackets kept tight');
  perform tests.eq(public.clean_product_name('C. Igien. Regina Rotoloni 4rot'), 'Carta igienica Regina Rotoloni 4rot', 'toilet paper');
  perform tests.eq(public.clean_product_name('Ace Candeggina Bagno Spray Ml.'), 'Ace Candeggina Bagno Spray', 'unit without number dropped');
  perform tests.eq(public.clean_product_name('Vileda Panno Vetri'), 'Vileda Panno Vetri', 'clean names unchanged');
end $$;

-- New products are cleaned on insert and keep the ERP text.
insert into public.products (sku, slug, name, price_cents, vat_rate, weight_g)
values ('t-name', 't-name', 'Malizia SAP.LIQ.300 Ml.mus.bianco', 199, 22, 300);
do $$ begin
  perform tests.eq((select name from public.products where sku = 't-name'), 'Malizia sapone liquido 300 ml mus. bianco', 'cleaned on insert');
  perform tests.eq((select erp_name from public.products where sku = 't-name'), 'Malizia SAP.LIQ.300 Ml.mus.bianco', 'ERP text kept');
end $$;
-- Staff edits of the name are not cleaned again.
update public.products set name = 'Sapone liquido Malizia muschio bianco 300 ml' where sku = 't-name';
do $$ begin
  perform tests.eq((select name from public.products where sku = 't-name'), 'Sapone liquido Malizia muschio bianco 300 ml', 'edit kept');
end $$;
rollback;
