-- Permanently removes the placeholder catalogue that was used for the demos, once the real
-- products are online (staging, 2026-10-02: they are already hidden and out of every category).
--   * the 22 "demo-" products and the 8 seeded placeholder products (order history keeps their
--     name, SKU and price; reviews and stock rows go with them);
--   * the old, hidden categories that no product uses any more.
-- Run in the Supabase SQL editor of the project. Safe to run more than once.
begin;

delete from public.products
where sku like 'demo-%'
   or sku in ('detergente-lavatrice', 'carta-cucina', 'contenitori-cucina', 'padella-28',
              'pattumiera-25', 'lampada-tavolo', 'asciugamani-3', 'organizer-grande');

-- Hidden categories that no product uses any more (subcategories first, then their parents).
delete from public.categories c
where not c.active and c.parent_id is not null
  and not exists (select 1 from public.products p where p.category_id = c.id);
delete from public.categories c
where not c.active
  and not exists (select 1 from public.products p where p.category_id = c.id)
  and not exists (select 1 from public.categories ch where ch.parent_id = c.id);

commit;

-- What is left:
select coalesce(par.name || ' > ', '') || c.name as categoria, c.active as visibile, count(p.id) as prodotti
from public.categories c
left join public.categories par on par.id = c.parent_id
left join public.products p on p.category_id = c.id
group by 1, 2, coalesce(par.sort, c.sort), c.parent_id, c.sort
order by coalesce(par.sort, c.sort), c.parent_id nulls first, c.sort;
