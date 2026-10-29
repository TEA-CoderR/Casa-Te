-- "Potrebbe servirti anche" in the cart: products to add, chosen from what is in the cart.
-- Score: bought together in past orders, same department (complements, e.g. detergent -> softener),
-- same subcategory, on offer, small price (easy to add). At most 2 per subcategory, in stock in the store,
-- with a photo, not already in the cart. Only product ids leave the function (no order or customer data).
create or replace function public.cart_suggestions(p_store uuid, p_products uuid[], p_limit integer default 10)
returns table (product_id uuid)
language sql stable security definer set search_path = '' as $$
  with cart as (
    select p.id, p.category_id, coalesce(c.parent_id, p.category_id) as dept
    from public.products p left join public.categories c on c.id = p.category_id
    where p.id = any(coalesce(p_products, '{}'))
  ), co as (
    select b.product_id, count(distinct b.order_id) as n
    from public.order_items a
    join public.order_items b on b.order_id = a.order_id and b.product_id is distinct from a.product_id
    join public.orders o on o.id = a.order_id and o.status not in ('pending_payment', 'cancelled')
    where a.product_id = any(coalesce(p_products, '{}')) and b.product_id is not null
    group by b.product_id
  ), cand as (
    select p.id, p.category_id, p.category_rank, p.price_cents, p.on_offer,
      coalesce(co.n, 0) as co_n,
      p.category_id in (select category_id from cart where category_id is not null) as same_sub,
      coalesce(c.parent_id, p.category_id) in (select dept from cart where dept is not null) as same_dept
    from public.products p
    left join public.categories c on c.id = p.category_id
    left join co on co.product_id = p.id
    where p.active and not (p.id = any(coalesce(p_products, '{}')))
      and exists (select 1 from public.inventory v where v.product_id = p.id and v.quantity > 0
        and (p_store is null or v.store_id = p_store))
      and exists (select 1 from public.product_images i where i.product_id = p.id)
  ), scored as (
    select cand.*,
      least(co_n, 5) * 3
      + case when same_dept and not same_sub then 2.5 when same_sub then 1.5 else 0 end
      + case when on_offer then 2 else 0 end
      + case when price_cents <= 500 then 1 else 0 end as score
    from cand
    where exists (select 1 from cart) and (co_n > 0 or same_dept or on_offer)
  ), diverse as (
    select scored.*, row_number() over (partition by category_id order by score desc, on_offer desc, price_cents, id) as rn
    from scored
  )
  select id from diverse where rn <= 2
  order by score desc, category_rank nulls last, price_cents, id
  limit least(greatest(coalesce(p_limit, 10), 1), 20);
$$;

revoke all on function public.cart_suggestions(uuid, uuid[], integer) from public;
grant execute on function public.cart_suggestions(uuid, uuid[], integer) to anon, authenticated;
