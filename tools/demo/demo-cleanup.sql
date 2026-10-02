-- Removes the DEMO catalogue added by tools/demo/demo-catalog.sql.
-- Products that were already ordered cannot be deleted (order history keeps them): those are
-- hidden instead. Real products and the subcategories they use are left alone.
begin;

-- Hide demo products that appear in orders; delete the others (images and stock cascade).
update public.products set active = false
where sku like 'demo-%' and exists (select 1 from public.order_items oi where oi.product_id = products.id);
delete from public.products p
where p.sku like 'demo-%' and not exists (select 1 from public.order_items oi where oi.product_id = p.id);

-- Seeded products: back to plain products (no variant group / demo attributes).
update public.products set variant_group = null, variant_title = null, variant_label = null, color = null
where sku in ('organizer-grande', 'pattumiera-25', 'lampada-tavolo', 'asciugamani-3', 'contenitori-cucina', 'padella-28', 'carta-cucina', 'detergente-lavatrice');

-- Subcategories that no product uses any more.
delete from public.categories c
where c.slug in ('carta-monouso', 'accessori-pulizia', 'pentole-padelle', 'conservazione', 'stoviglie', 'illuminazione',
                 'decorazione', 'tessili', 'lavatrice', 'scatole-contenitori', 'pattumiere')
  and not exists (select 1 from public.products p where p.category_id = c.id);

commit;
