-- Per category: products in stock (any store) and one cover product, for the department tiles and lists.
-- Replaces two client queries that PostgREST capped at 1000 rows (counts and covers were incomplete).
create or replace function public.category_overview(p_avoid text[] default '{}')
returns table (category_id uuid, products integer, cover_path text, cover_sku text)
language sql stable security invoker set search_path = public
as $$
  with stocked as (
    select p.id, p.sku, p.category_id, p.featured, p.created_at,
      (select i.path from public.product_images i where i.product_id = p.id order by i.sort limit 1) as path
    from public.products p
    where p.active and p.category_id is not null
      and exists (select 1 from public.inventory v where v.product_id = p.id and v.quantity > 0)
  ), ranked as (
    select s.*, count(*) over (partition by s.category_id) as n,
      row_number() over (partition by s.category_id
        order by (s.path is null), (s.sku = any(coalesce(p_avoid, '{}'))), s.featured desc, s.created_at, s.sku) as r
    from stocked s
  )
  select category_id, n::integer, path, sku from ranked where r = 1;
$$;

revoke all on function public.category_overview(text[]) from public;
grant execute on function public.category_overview(text[]) to anon, authenticated, service_role;
