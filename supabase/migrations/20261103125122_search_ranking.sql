-- Search results in a useful order: what can be bought first, then how well the name matches.
-- Every typed word must appear (in any order), folded like products.search_text (public.search_fold).
-- Ranking: in stock (in the chosen store, or anywhere when none is chosen), then
--   0 name starts with the text, 1 the first word is a whole word of the name, 2 a word of the name or the brand
--   starts with it, 3 found elsewhere (inside a word, the code),
-- then the category order and the name. Display only: prices and stock are read again by the caller.
create or replace function public.search_products(
  p_query text, p_store uuid default null, p_category_ids uuid[] default null,
  p_on_sale boolean default false, p_limit integer default 40, p_offset integer default 0)
returns table (product_id uuid, total bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  with q as (
    select public.search_fold(coalesce(p_query, '')) as k,
           array_remove(regexp_split_to_array(trim(public.search_fold(coalesce(p_query, ''))), '\s+'), '') as words
  ), hits as (
    select p.id, p.name, p.category_rank,
      exists (select 1 from public.inventory i where i.product_id = p.id and i.quantity > 0
              and (p_store is null or i.store_id = p_store)) as in_stock,
      case when public.search_fold(p.name) like trim(q.k) || '%' then 0
           when ' ' || public.search_fold(p.name) || ' ' like '% ' || q.words[1] || ' %' then 1
           when ' ' || public.search_fold(p.name) like '% ' || q.words[1] || '%'
             or public.search_fold(coalesce(p.brand, '')) like q.words[1] || '%' then 2
           else 3 end as rank
    from public.products p, q
    where p.active
      and cardinality(q.words) > 0
      and not exists (select 1 from unnest(q.words) w where p.search_text not like '%' || w || '%')
      and (p_category_ids is null or p.category_id = any (p_category_ids))
      and (not p_on_sale or p.compare_at_price_cents is not null or p.member_price_cents is not null)
  )
  select id, count(*) over ()
  from hits
  order by in_stock desc, rank, category_rank nulls last, name, id
  limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0);
$$;
revoke all on function public.search_products(text, uuid, uuid[], boolean, integer, integer) from public;
grant execute on function public.search_products(text, uuid, uuid[], boolean, integer, integer) to anon, authenticated, service_role;
