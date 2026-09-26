-- DEVELOPMENT / STAGING SEED ONLY — never run against production.
-- Placeholder catalogue carried over from the demo. Prices, weights and stock are NOT real
-- CASA & TE data; replace them through the admin console (CSV import).

insert into public.categories (slug, name, sort) values
  ('pulizia', 'Pulizia', 1),
  ('cucina', 'Cucina', 2),
  ('casa', 'Casa', 3),
  ('bagno', 'Bagno', 4),
  ('organizzazione', 'Organizzazione', 5)
on conflict (slug) do nothing;

insert into public.products (sku, slug, name, description, category_id, price_cents, weight_g, featured)
select v.sku, v.sku, v.name, v.description, c.id, v.price_cents, v.weight_g, v.featured
from (values
  ('detergente-lavatrice', 'Detergente lavatrice 40 lavaggi', 'Prodotto dimostrativo.', 'pulizia', 799, 2200, true),
  ('carta-cucina', 'Carta cucina 6 rotoli', 'Prodotto dimostrativo.', 'pulizia', 499, 1200, true),
  ('contenitori-cucina', 'Set contenitori cucina 5 pezzi', 'Prodotto dimostrativo.', 'cucina', 999, 800, true),
  ('padella-28', 'Padella antiaderente 28 cm', 'Prodotto dimostrativo.', 'cucina', 1299, 1100, true),
  ('pattumiera-25', 'Pattumiera 25 L', 'Prodotto dimostrativo.', 'organizzazione', 1499, 1500, false),
  ('lampada-tavolo', 'Lampada da tavolo', 'Prodotto dimostrativo.', 'casa', 1199, 700, true),
  ('asciugamani-3', 'Asciugamani set 3 pezzi', 'Prodotto dimostrativo.', 'bagno', 899, 900, false),
  ('organizer-grande', 'Scatola organizer grande', 'Prodotto dimostrativo.', 'organizzazione', 699, 600, false)
) as v(sku, name, description, category, price_cents, weight_g, featured)
join public.categories c on c.slug = v.category
on conflict (sku) do nothing;

-- Demo stock: 25 units of everything in every store.
insert into public.inventory (store_id, product_id, quantity)
select s.id, p.id, 25 from public.stores s cross join public.products p
on conflict do nothing;

-- Clearly fictitious pickup points for testing the checkout flow.
insert into public.pickup_points (name, carrier, address, city, postal_code, province, notes) values
  ('Punto di ritiro DEMO Lucca', 'Demo', 'Indirizzo di prova 1', 'Lucca', '55100', 'LU', 'Solo per test'),
  ('Punto di ritiro DEMO Arezzo', 'Demo', 'Indirizzo di prova 2', 'Arezzo', '52100', 'AR', 'Solo per test');

insert into public.coupons (code, description, kind, value, min_subtotal_cents, per_customer_limit)
values ('BENVENUTO10', 'Sconto di benvenuto 10% (test)', 'percent', 10, 2000, 1)
on conflict (code) do nothing;
