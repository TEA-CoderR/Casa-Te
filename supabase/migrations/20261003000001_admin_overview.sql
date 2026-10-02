-- Back-office overview: everything the "Panoramica" page shows, in one call.
-- Days are counted in Europe/Rome. The previous period has the same length and ends the day before p_from.
create or replace function public.admin_overview(p_from date, p_to date, p_store_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_store uuid := p_store_id;
  v_manager boolean := public.is_manager();
  v_today date := (now() at time zone 'Europe/Rome')::date;
  v_prev_from date;
  v_start date;
  v_end date;
  v_result jsonb;
begin
  if not public.is_staff() then raise exception 'forbidden' using errcode = 'P0001'; end if;
  if public.staff_role() = 'store_staff' then v_store := public.staff_store_id(); end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 366 then
    raise exception 'invalid_range' using errcode = 'P0001';
  end if;
  v_prev_from := p_from - (p_to - p_from + 1);
  v_start := least(v_prev_from, v_today - 7);
  v_end := greatest(p_to, v_today);

  with paid as (
    select (o.paid_at at time zone 'Europe/Rome')::date d, o.total_cents - o.refunded_cents net, o.user_id
    from public.orders o
    where o.paid_at >= (v_start::timestamp at time zone 'Europe/Rome')
      and o.paid_at < ((v_end + 1)::timestamp at time zone 'Europe/Rome')
      and (v_store is null or o.store_id = v_store)
  ),
  signups as (
    select (p.created_at at time zone 'Europe/Rome')::date d from public.profiles p
    where v_manager and p.created_at >= (v_start::timestamp at time zone 'Europe/Rome')
  ),
  period as (
    select o.* from public.orders o
    where o.created_at >= (p_from::timestamp at time zone 'Europe/Rome')
      and o.created_at < ((p_to + 1)::timestamp at time zone 'Europe/Rome')
      and (v_store is null or o.store_id = v_store)
  ),
  sold as (
    select oi.product_id, oi.sku, max(oi.name) name, sum(oi.quantity) quantity, sum(oi.line_total_cents) revenue_cents
    from public.order_items oi join period on period.id = oi.order_id
    where period.paid_at is not null and period.status <> 'cancelled'
    group by oi.product_id, oi.sku
    order by sum(oi.quantity) desc, max(oi.name) limit 5
  )
  select jsonb_build_object(
    'today', v_today,
    'from', p_from, 'to', p_to, 'prev_from', v_prev_from,
    'series', (select jsonb_agg(jsonb_build_object(
        'day', g.d,
        'revenue_cents', coalesce((select sum(net) from paid where paid.d = g.d), 0),
        'orders', (select count(*) from paid where paid.d = g.d),
        'customers', (select count(distinct user_id) from paid where paid.d = g.d),
        'new_customers', case when v_manager then (select count(*) from signups where signups.d = g.d) end
      ) order by g.d)
      from (select generate_series(v_start, v_end, interval '1 day')::date d) g),
    'status', coalesce((select jsonb_object_agg(status, n) from
        (select status, count(*) n from period group by 1) s), '{}'::jsonb),
    'open', coalesce((select jsonb_object_agg(status, n) from
        (select o.status, count(*) n from public.orders o
         where o.status in ('paid', 'picking', 'ready') and (v_store is null or o.store_id = v_store)
         group by 1) s), '{}'::jsonb),
    'top_products', coalesce((select jsonb_agg(jsonb_build_object(
        'product_id', sold.product_id, 'sku', sold.sku, 'name', coalesce(pr.name, sold.name),
        'category', coalesce(c.name, ''), 'price_cents', pr.price_cents,
        'image', (select i.path from public.product_images i where i.product_id = sold.product_id order by i.sort, i.created_at limit 1),
        'quantity', sold.quantity, 'revenue_cents', sold.revenue_cents)
        order by sold.quantity desc, sold.name)
      from sold left join public.products pr on pr.id = sold.product_id
      left join public.categories c on c.id = pr.category_id), '[]'::jsonb),
    'low_stock', coalesce((select jsonb_agg(ls) from
        (select pr.id product_id, s.code store_code, pr.sku, pr.name, i.quantity,
           (select im.path from public.product_images im where im.product_id = pr.id order by im.sort, im.created_at limit 1) image
         from public.inventory i join public.products pr on pr.id = i.product_id and pr.active
         join public.stores s on s.id = i.store_id
         where i.quantity <= 3 and (v_store is null or i.store_id = v_store)
         order by i.quantity, pr.name limit 6) ls), '[]'::jsonb)
  ) into v_result;
  return v_result;
end $$;

-- Staff only (checked inside); never callable anonymously.
revoke execute on function public.admin_overview(date, date, uuid) from public, anon;
grant execute on function public.admin_overview(date, date, uuid) to authenticated, service_role;
