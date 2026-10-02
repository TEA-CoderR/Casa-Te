-- DEMO catalogue for presentations: subcategories plus demo products (SKU prefix "demo-",
-- description "Prodotto dimostrativo"). Prices, stock and attributes are invented for the demo:
-- remove them with tools/demo/demo-cleanup.sql before going live.
-- Images are served by the web shop itself (apps/mobile/public/demo/*.jpg on GitHub Pages).
-- Safe to run more than once.
begin;

-- ---------------------------------------------------------------------------
-- Subcategories (parents are the existing top-level categories, matched by slug)
-- ---------------------------------------------------------------------------
insert into public.categories (slug, name, parent_id, sort)
select v.slug, v.name, p.id, v.sort
from (values
  ('carta-monouso', 'Carta e monouso', 'pulizia', 1),
  ('accessori-pulizia', 'Accessori pulizia', 'pulizia', 2),
  ('pentole-padelle', 'Pentole e padelle', 'cucina', 1),
  ('conservazione', 'Conservazione', 'cucina', 2),
  ('stoviglie', 'Stoviglie', 'cucina', 3),
  ('illuminazione', 'Illuminazione', 'casa', 1),
  ('decorazione', 'Decorazione', 'casa', 2),
  ('tessili', 'Tessili', 'casa', 3),
  ('lavatrice', 'Lavatrice', 'bagno', 1),
  ('scatole-contenitori', 'Scatole e contenitori', 'organizzazione', 1),
  ('pattumiere', 'Pattumiere', 'organizzazione', 2)
) as v(slug, name, parent, sort)
join public.categories p on p.slug = v.parent and p.parent_id is null
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- Demo products
-- ---------------------------------------------------------------------------
create temporary table demo_products (
  sku text, name text, cat text, price integer, weight integer, color text, unit text, qty numeric,
  vgroup text, vtitle text, vlabel text, img text, featured boolean, highlights jsonb
) on commit drop;

insert into demo_products values
  ('demo-organizer-grigio', 'Scatola organizer grande Grigio perla', 'scatole-contenitori', 699, 600, 'Grigio', null, null, 'scatola-organizer', 'colore', 'Grigio', 'organizer-grigio', false, '[{"icon":"box","label":"Pieghevole"},{"icon":"hand","label":"Maniglie laterali"}]'),
  ('demo-organizer-verde', 'Scatola organizer grande Verde salvia', 'scatole-contenitori', 699, 600, 'Verde', null, null, 'scatola-organizer', 'colore', 'Verde', 'organizer-verde', false, '[{"icon":"box","label":"Pieghevole"},{"icon":"hand","label":"Maniglie laterali"}]'),
  ('demo-organizer-blu', 'Scatola organizer grande Blu polvere', 'scatole-contenitori', 699, 600, 'Blu', null, null, 'scatola-organizer', 'colore', 'Blu', 'organizer-blu', true, '[{"icon":"box","label":"Pieghevole"},{"icon":"hand","label":"Maniglie laterali"}]'),
  ('demo-pattumiera-bianco', 'Pattumiera a pedale 25 L Bianco', 'pattumiere', 1499, 1500, 'Bianco', null, null, 'pattumiera-25', 'colore', 'Bianco', 'pattumiera-bianco', false, '[{"icon":"shield","label":"Chiusura silenziosa"},{"icon":"recycle","label":"Secchio estraibile"}]'),
  ('demo-pattumiera-grigio', 'Pattumiera a pedale 25 L Grigio', 'pattumiere', 1499, 1500, 'Grigio', null, null, 'pattumiera-25', 'colore', 'Grigio', 'pattumiera-grigio', false, '[{"icon":"shield","label":"Chiusura silenziosa"},{"icon":"recycle","label":"Secchio estraibile"}]'),
  ('demo-pattumiera-terracotta', 'Pattumiera a pedale 25 L Terracotta', 'pattumiere', 1599, 1500, 'Terracotta', null, null, 'pattumiera-25', 'colore', 'Terracotta', 'pattumiera-terracotta', true, '[{"icon":"shield","label":"Chiusura silenziosa"},{"icon":"recycle","label":"Secchio estraibile"}]'),
  ('demo-lampada-verde', 'Lampada da tavolo Verde salvia', 'illuminazione', 1199, 700, 'Verde', null, null, 'lampada-tavolo', 'colore', 'Verde', 'lampada-verde', true, '[{"icon":"sun","label":"Luce calda"},{"icon":"home","label":"Per ogni ambiente"},{"icon":"diamond","label":"Design essenziale"}]'),
  ('demo-lampada-rosa', 'Lampada da tavolo Rosa cipria', 'illuminazione', 1199, 700, 'Rosa', null, null, 'lampada-tavolo', 'colore', 'Rosa', 'lampada-rosa', false, '[{"icon":"sun","label":"Luce calda"},{"icon":"home","label":"Per ogni ambiente"},{"icon":"diamond","label":"Design essenziale"}]'),
  ('demo-lampada-grigio', 'Lampada da tavolo Grigio ardesia', 'illuminazione', 1199, 700, 'Grigio', null, null, 'lampada-tavolo', 'colore', 'Grigio', 'lampada-grigio', false, '[{"icon":"sun","label":"Luce calda"},{"icon":"home","label":"Per ogni ambiente"},{"icon":"diamond","label":"Design essenziale"}]'),
  ('demo-asciugamani-terracotta', 'Asciugamani set 3 pezzi Terracotta', 'tessili', 899, 900, 'Terracotta', 'pz', 3, 'asciugamani-3', 'colore', 'Terracotta', 'asciugamani-terracotta', true, '[{"icon":"drop","label":"Molto assorbenti"},{"icon":"leaf","label":"Cotone morbido"}]'),
  ('demo-asciugamani-blu', 'Asciugamani set 3 pezzi Blu polvere', 'tessili', 899, 900, 'Blu', 'pz', 3, 'asciugamani-3', 'colore', 'Blu', 'asciugamani-blu', false, '[{"icon":"drop","label":"Molto assorbenti"},{"icon":"leaf","label":"Cotone morbido"}]'),
  ('demo-asciugamani-grigio', 'Asciugamani set 3 pezzi Grigio perla', 'tessili', 899, 900, 'Grigio', 'pz', 3, 'asciugamani-3', 'colore', 'Grigio', 'asciugamani-grigio', false, '[{"icon":"drop","label":"Molto assorbenti"},{"icon":"leaf","label":"Cotone morbido"}]'),
  ('demo-canovacci-lino', 'Canovacci in lino a righe, set 2', 'tessili', 1290, 300, 'Naturale', 'pz', 2, null, null, null, 'canovacci', true, '[{"icon":"leaf","label":"Lino naturale"},{"icon":"drop","label":"Asciuga rapido"}]'),
  ('demo-vaso-ceramica', 'Vaso in ceramica smaltata', 'decorazione', 2490, 1300, 'Naturale', null, null, null, null, null, 'vaso', true, '[{"icon":"hand","label":"Smaltato a mano"},{"icon":"diamond","label":"Pezzo unico"}]'),
  ('demo-ciotole-ceramica', 'Ciotole in ceramica verde, set 3', 'stoviglie', 1990, 1600, 'Verde', 'pz', 3, null, null, null, 'ciotole', true, '[{"icon":"hand","label":"Ceramica artigianale"},{"icon":"drop","label":"Lavabili in lavastoviglie"}]'),
  ('demo-ciotola-portata', 'Ciotola da portata in ceramica', 'stoviglie', 1690, 1100, 'Verde', null, null, null, null, null, 'ciotola-limoni', false, '[{"icon":"hand","label":"Ceramica artigianale"},{"icon":"home","label":"Ideale per la frutta"}]'),
  ('demo-barattoli-vetro', 'Barattoli in vetro con coperchio in legno, set 2', 'conservazione', 1290, 1400, null, 'pz', 2, null, null, null, 'barattoli', true, '[{"icon":"shield","label":"Vetro resistente"},{"icon":"leaf","label":"Coperchio in bambù"}]'),
  ('demo-contenitori-3', 'Set contenitori cucina 3 pezzi', 'conservazione', 699, 500, null, 'pz', 3, 'contenitori-cucina', 'formato', '3 pezzi', 'contenitori', false, '[{"icon":"shield","label":"Chiusura ermetica"},{"icon":"drop","label":"Lavastoviglie"}]'),
  ('demo-padella-20', 'Padella antiaderente 20 cm', 'pentole-padelle', 899, 700, 'Nero', null, null, 'padella-antiaderente', 'misura', '20 cm', 'padella', false, '[{"icon":"shield","label":"Antiaderente"},{"icon":"sun","label":"Tutti i fuochi"},{"icon":"hand","label":"Manico in legno"}]'),
  ('demo-padella-24', 'Padella antiaderente 24 cm', 'pentole-padelle', 1099, 900, 'Nero', null, null, 'padella-antiaderente', 'misura', '24 cm', 'padella', false, '[{"icon":"shield","label":"Antiaderente"},{"icon":"sun","label":"Tutti i fuochi"},{"icon":"hand","label":"Manico in legno"}]'),
  ('demo-carta-12', 'Carta cucina 12 rotoli', 'carta-monouso', 899, 2300, null, 'pz', 12, 'carta-cucina', 'formato', '12 rotoli', 'carta-cucina', false, '[{"icon":"drop","label":"Extra assorbente"},{"icon":"box","label":"Formato convenienza"}]'),
  ('demo-detergente-20', 'Detergente lavatrice 20 lavaggi', 'lavatrice', 449, 1100, null, null, null, 'detergente-lavatrice', 'formato', '20 lavaggi', 'detergente', false, '[{"icon":"sparkle","label":"Pulito brillante"},{"icon":"drop","label":"Anche a freddo"}]');

insert into public.products (sku, slug, name, description, category_id, price_cents, weight_g, color, unit, unit_quantity,
  variant_group, variant_title, variant_label, featured, highlights, active)
select d.sku, d.sku, d.name, 'Prodotto dimostrativo.', c.id, d.price, d.weight, d.color, d.unit, d.qty,
  d.vgroup, d.vtitle, d.vlabel, d.featured, d.highlights, true
from demo_products d join public.categories c on c.slug = d.cat
on conflict (sku) do nothing;

insert into public.product_images (product_id, path, alt, sort)
select p.id, 'https://tea-coderr.github.io/Casa-Te/demo/' || d.img || '.jpg', d.name, 0
from demo_products d join public.products p on p.sku = d.sku
where not exists (select 1 from public.product_images i where i.product_id = p.id);

-- Demo stock in every store (deterministic, 4–30 units).
insert into public.inventory (store_id, product_id, quantity)
select s.id, p.id, 4 + abs(hashtext(p.sku || s.code)) % 27
from public.products p cross join public.stores s
where p.sku like 'demo-%'
on conflict (store_id, product_id) do nothing;

-- ---------------------------------------------------------------------------
-- Seeded demo products: subcategory, colour and variant label so they join their groups
-- ---------------------------------------------------------------------------
update public.products p set category_id = c.id, color = v.color, variant_group = v.vgroup, variant_title = v.vtitle, variant_label = v.vlabel,
  unit = coalesce(p.unit, v.unit), unit_quantity = coalesce(p.unit_quantity, v.qty)
from (values
  ('organizer-grande', 'scatole-contenitori', 'Beige', 'scatola-organizer', 'colore', 'Beige', null, null::numeric),
  ('pattumiera-25', 'pattumiere', 'Verde', 'pattumiera-25', 'colore', 'Verde', null, null),
  ('lampada-tavolo', 'illuminazione', 'Crema', 'lampada-tavolo', 'colore', 'Crema', null, null),
  ('asciugamani-3', 'tessili', 'Naturale', 'asciugamani-3', 'colore', 'Naturale', 'pz', 3),
  ('contenitori-cucina', 'conservazione', null, 'contenitori-cucina', 'formato', '5 pezzi', 'pz', 5),
  ('padella-28', 'pentole-padelle', 'Nero', 'padella-antiaderente', 'misura', '28 cm', null, null),
  ('carta-cucina', 'carta-monouso', null, 'carta-cucina', 'formato', '6 rotoli', 'pz', 6),
  ('detergente-lavatrice', 'lavatrice', null, 'detergente-lavatrice', 'formato', '40 lavaggi', null, null)
) as v(sku, cat, color, vgroup, vtitle, vlabel, unit, qty)
join public.categories c on c.slug = v.cat
where p.sku = v.sku;

-- Products already in the parent "bagno" category (detergents) go to its new subcategory.
update public.products p set category_id = sub.id
from public.categories parent, public.categories sub
where parent.slug = 'bagno' and sub.slug = 'lavatrice' and p.category_id = parent.id;

commit;
