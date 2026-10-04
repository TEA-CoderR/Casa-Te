-- Manual order of the shop's home rows: "In evidenza" (starred products) and "In offerta" (discounted
-- products). Position 1 comes first; products without a position follow in the default order
-- (name for "In evidenza", biggest discount for "In offerta"). Display only: no effect on prices.
alter table public.products
  add column featured_rank integer check (featured_rank is null or featured_rank between 1 and 10000),
  add column offer_rank integer check (offer_rank is null or offer_rank between 1 and 10000);

create index products_featured_rank_idx on public.products (featured_rank) where featured_rank is not null;
create index products_offer_rank_idx on public.products (offer_rank) where offer_rank is not null;

-- Saves one row's order in a single statement: the listed products get positions 1..n, every other
-- product loses its position. Runs as the caller, so the products RLS (managers only) applies.
create or replace function public.admin_set_showcase_order(p_kind text, p_product_ids uuid[])
returns integer language plpgsql security invoker set search_path = '' as $$
declare
  v_count integer;
begin
  if not public.is_manager() then raise exception 'forbidden' using errcode = 'P0001'; end if;
  if p_kind not in ('featured', 'offer') then raise exception 'invalid_kind' using errcode = 'P0001'; end if;
  if p_product_ids is null or cardinality(p_product_ids) > 500
     or cardinality(p_product_ids) <> (select count(distinct x) from unnest(p_product_ids) x) then
    raise exception 'invalid_order' using errcode = 'P0001';
  end if;

  if p_kind = 'featured' then
    update public.products p set featured_rank = o.pos
      from unnest(p_product_ids) with ordinality o(id, pos)
      where p.id = o.id and p.featured_rank is distinct from o.pos;
    update public.products set featured_rank = null
      where featured_rank is not null and not (id = any (p_product_ids));
  else
    update public.products p set offer_rank = o.pos
      from unnest(p_product_ids) with ordinality o(id, pos)
      where p.id = o.id and p.offer_rank is distinct from o.pos;
    update public.products set offer_rank = null
      where offer_rank is not null and not (id = any (p_product_ids));
  end if;

  select count(*) into v_count from public.products
    where (case when p_kind = 'featured' then featured_rank else offer_rank end) is not null;
  return v_count;
end $$;

revoke execute on function public.admin_set_showcase_order(text, uuid[]) from public, anon;
grant execute on function public.admin_set_showcase_order(text, uuid[]) to authenticated, service_role;
