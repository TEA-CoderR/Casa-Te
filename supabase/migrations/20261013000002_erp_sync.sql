-- ERP (ITO) sync: per-store prices with dated promotions, stock from the ERP minus online orders not yet rung
-- up at the till, and the batch entry point used by the `erp-sync` Edge Function.
--
-- Price of a product in a store (single source of truth, used by quote_cart):
--   regular = inventory.price_cents (store price from the ERP) or products.price_cents (catalogue price)
--   if a store promotion is valid today (Europe/Rome) and lower than regular -> promo price, regular struck through
--   otherwise regular (products.compare_at_price_cents still applies to products priced in the admin).
-- products.price_cents / compare_at_price_cents of ERP products are refreshed from the main online store for
-- listing, sorting and filters (refresh_display_prices, every 15 minutes and after each batch).
--
-- Stock: inventory.erp_quantity is what the ERP reports. Online orders reach the ERP only when the store rings
-- them up at the till (orders.pos_registered_at), so the sellable quantity is
--   erp_quantity - quantity of this store's orders that hold stock and are not registered at the till yet.

alter table public.products add column erp_code text unique check (erp_code is null or erp_code ~ '^[A-Za-z0-9._-]{1,40}$');

alter table public.inventory
  add column price_cents integer check (price_cents is null or price_cents > 0),
  add column promo_price_cents integer check (promo_price_cents is null or promo_price_cents > 0),
  add column promo_starts_on date,
  add column promo_ends_on date,
  add column erp_quantity integer check (erp_quantity is null or erp_quantity >= 0),
  add column erp_synced_at timestamptz,
  add constraint inventory_promo_dates check (promo_starts_on is null or promo_ends_on is null or promo_ends_on >= promo_starts_on);

alter table public.orders
  add column pos_registered_at timestamptz,
  add column pos_registered_by uuid references auth.users (id) on delete set null;
create index orders_pos_pending_idx on public.orders (store_id) where pos_registered_at is null and status <> 'cancelled';

alter table public.inventory_movements drop constraint inventory_movements_reason_check;
alter table public.inventory_movements add constraint inventory_movements_reason_check
  check (reason in ('order_reserve', 'order_release', 'manual', 'import', 'stocktake', 'erp_sync'));

-- Today in Italy (the database runs in UTC).
create or replace function public.shop_today()
returns date language sql stable set search_path = '' as $$
  select (now() at time zone 'Europe/Rome')::date
$$;

create or replace function public.store_unit_price(
  p_list_cents integer, p_compare_cents integer, p_store_cents integer,
  p_promo_cents integer, p_promo_from date, p_promo_to date, p_today date)
returns table (price_cents integer, compare_at_price_cents integer)
language sql immutable set search_path = '' as $$
  with r as (select coalesce(p_store_cents, p_list_cents) as regular)
  select
    case when promo then p_promo_cents else r.regular end,
    case when promo then r.regular
         when p_store_cents is null and p_compare_cents > r.regular then p_compare_cents end
  from r, lateral (select p_promo_cents is not null and p_promo_cents < r.regular
                     and (p_promo_from is null or p_promo_from <= p_today)
                     and (p_promo_to is null or p_promo_to >= p_today) as promo) x
$$;

-- Quantity of a store's product held by online orders that the till does not know about yet.
create or replace function public.pos_pending_quantity(p_store_id uuid, p_product_id uuid)
returns integer language sql stable security definer set search_path = '' as $$
  select coalesce(sum(oi.quantity), 0)::integer
  from public.order_items oi join public.orders o on o.id = oi.order_id
  where o.store_id = p_store_id and oi.product_id = p_product_id and o.pos_registered_at is null
    and o.status <> 'cancelled' and (o.status <> 'pending_payment' or o.expires_at > now())
$$;

-- Listing price of ERP products = price in the main online store (active store with the lowest sort).
create or replace function public.refresh_display_prices()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_store uuid;
  v_count integer;
begin
  select id into v_store from public.stores where active order by sort, code limit 1;
  if v_store is null then return 0; end if;
  with eff as (
    select pr.id, sp.price_cents, sp.compare_at_price_cents
    from public.products pr
    join public.inventory i on i.product_id = pr.id and i.store_id = v_store and i.price_cents is not null
    cross join lateral public.store_unit_price(pr.price_cents, pr.compare_at_price_cents, i.price_cents,
      i.promo_price_cents, i.promo_starts_on, i.promo_ends_on, public.shop_today()) sp
    where pr.erp_code is not null
  )
  update public.products pr set price_cents = eff.price_cents, compare_at_price_cents = eff.compare_at_price_cents
  from eff
  where pr.id = eff.id and (pr.price_cents, pr.compare_at_price_cents) is distinct from (eff.price_cents, eff.compare_at_price_cents);
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- ---------------------------------------------------------------------------
-- quote_cart: as in 20261002000001 except the unit price, which is now the store price.
-- ---------------------------------------------------------------------------
create or replace function public.quote_cart(p jsonb)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_store public.stores;
  v_lines jsonb;
  v_subtotal integer;
  v_weight integer;
  v_count integer;
  v_issue_count integer;
  v_coupon public.coupons;
  v_coupon_code text := nullif(upper(trim(coalesce(p ->> 'coupon_code', ''))), '');
  v_coupon_error text;
  v_discount integer := 0;
  v_free_ship boolean := false;
  v_goods integer;
  v_fulfilment text := nullif(p ->> 'fulfilment', '');
  v_ship jsonb := '{}'::jsonb;
  v_method text;
  v_rate record;
  v_has_pickup_points boolean;
  v_shipping integer;
  v_used integer;
  v_today date := public.shop_today();
begin
  if p is null or jsonb_typeof(p -> 'items') is distinct from 'array' or jsonb_array_length(p -> 'items') = 0 then
    raise exception 'empty_cart' using errcode = 'P0001';
  end if;
  if jsonb_array_length(p -> 'items') > 100 then
    raise exception 'too_many_items' using errcode = 'P0001';
  end if;
  if v_fulfilment is not null and v_fulfilment not in ('home', 'pickup', 'store') then
    raise exception 'invalid_fulfilment' using errcode = 'P0001';
  end if;

  begin
    select * into v_store from public.stores where id = (p ->> 'store_id')::uuid and active;
  exception when invalid_text_representation then
    raise exception 'invalid_store' using errcode = 'P0001';
  end;
  if not found then raise exception 'invalid_store' using errcode = 'P0001'; end if;

  begin
    with req as (
      select (e ->> 'product_id')::uuid as product_id,
             sum(least(greatest(coalesce((e ->> 'quantity')::bigint, 0), -1), 1000))::integer as quantity
      from jsonb_array_elements(p -> 'items') e
      group by 1
    ), priced as (
      select r.product_id, pr.sku, coalesce(pr.name, 'Prodotto non disponibile') as name,
             sp.price_cents, pr.vat_rate, pr.weight_g, r.quantity,
             coalesce(i.quantity, 0) as available,
             (select pi.path from public.product_images pi
               where pi.product_id = pr.id order by pi.sort, pi.created_at limit 1) as image_path,
             case
               when pr.id is null or not pr.active then 'unavailable'
               when r.quantity < 1 or r.quantity > pr.max_per_order then 'invalid_quantity'
               when coalesce(i.quantity, 0) < r.quantity then 'insufficient_stock'
             end as issue
      from req r
      left join public.products pr on pr.id = r.product_id
      left join public.inventory i on i.product_id = r.product_id and i.store_id = v_store.id
      left join lateral public.store_unit_price(pr.price_cents, pr.compare_at_price_cents, i.price_cents,
        i.promo_price_cents, i.promo_starts_on, i.promo_ends_on, v_today) sp on true
    )
    select
      coalesce(jsonb_agg(jsonb_build_object(
        'product_id', product_id, 'sku', sku, 'name', name, 'image_path', image_path,
        'unit_price_cents', price_cents, 'vat_rate', vat_rate, 'weight_g', weight_g,
        'quantity', quantity, 'line_total_cents', case when issue is null then price_cents * quantity else 0 end,
        'available_quantity', available, 'issue', issue) order by name), '[]'::jsonb),
      coalesce(sum(price_cents * quantity) filter (where issue is null), 0),
      coalesce(sum(weight_g * quantity) filter (where issue is null), 0),
      coalesce(sum(quantity) filter (where issue is null), 0),
      count(*) filter (where issue is not null)
    into v_lines, v_subtotal, v_weight, v_count, v_issue_count
    from priced;
  exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'invalid_items' using errcode = 'P0001';
  end;

  -- Coupon
  if v_coupon_code is not null then
    select * into v_coupon from public.coupons where code = v_coupon_code;
    if not found or not v_coupon.active then
      v_coupon_error := 'coupon_not_found';
    elsif (v_coupon.starts_at is not null and now() < v_coupon.starts_at)
       or (v_coupon.ends_at is not null and now() > v_coupon.ends_at) then
      v_coupon_error := 'coupon_expired';
    elsif v_coupon.max_redemptions is not null and v_coupon.redemptions >= v_coupon.max_redemptions then
      v_coupon_error := 'coupon_exhausted';
    elsif v_coupon.club_only and not public.is_club_member() then
      v_coupon_error := 'coupon_club_only';
    elsif v_subtotal < v_coupon.min_subtotal_cents then
      v_coupon_error := 'coupon_min_subtotal';
    else
      if v_coupon.per_customer_limit is not null and auth.uid() is not null then
        select count(*) into v_used from public.orders o
        where o.coupon_id = v_coupon.id and o.user_id = auth.uid()
          and (o.payment_status <> 'unpaid' or (o.status = 'pending_payment' and o.expires_at > now()));
        if v_used >= v_coupon.per_customer_limit then v_coupon_error := 'coupon_already_used'; end if;
      end if;
      if v_coupon_error is null then
        if v_coupon.kind = 'percent' then v_discount := round(v_subtotal * v_coupon.value / 100.0);
        elsif v_coupon.kind = 'fixed' then v_discount := least(v_coupon.value, v_subtotal);
        else v_free_ship := true;
        end if;
      end if;
    end if;
  end if;

  -- Shipping bands use the value of goods after discount.
  v_goods := v_subtotal - v_discount;
  select exists (select 1 from public.pickup_points where active) into v_has_pickup_points;

  foreach v_method in array array['home', 'pickup', 'store'] loop
    if (v_method = 'store' and not v_store.pickup_enabled)
       or (v_method in ('home', 'pickup') and not v_store.ships_orders)
       or (v_method = 'pickup' and not v_has_pickup_points) then
      v_ship := v_ship || jsonb_build_object(v_method, null);
      continue;
    end if;
    select * into v_rate from public.shipping_cost_cents(v_method, v_goods, v_weight);
    if not found then
      v_ship := v_ship || jsonb_build_object(v_method, null);
    else
      v_ship := v_ship || jsonb_build_object(v_method, jsonb_build_object(
        'price_cents', case when v_free_ship then 0 else v_rate.price_cents end,
        'provisional', v_rate.provisional and not v_free_ship));
    end if;
  end loop;

  if v_fulfilment is not null then
    v_shipping := (v_ship -> v_fulfilment ->> 'price_cents')::integer;
  end if;

  return jsonb_build_object(
    'store_id', v_store.id,
    'lines', v_lines,
    'item_count', v_count,
    'issue_count', v_issue_count,
    'subtotal_cents', v_subtotal,
    'discount_cents', v_discount,
    'total_weight_g', v_weight,
    'coupon', case when v_coupon_error is null and v_coupon.id is not null then
      jsonb_build_object('code', v_coupon.code, 'kind', v_coupon.kind, 'value', v_coupon.value, 'description', v_coupon.description) end,
    'coupon_error', v_coupon_error,
    'shipping', v_ship,
    'fulfilment', v_fulfilment,
    'shipping_cents', v_shipping,
    'total_cents', case when v_fulfilment is null or v_shipping is null then null else v_goods + v_shipping end
  );
end $$;

-- ---------------------------------------------------------------------------
-- erp_apply_batch: called by the erp-sync Edge Function (service role only).
-- {
--   "store_code": "LU3", "sent_at": "2026-10-13T10:00:00Z",
--   "products": [{ "erp_code", "name", "barcode"?, "brand"?, "vat_rate"?, "price_cents", "weight_g"?, "active"? }],
--   "store_items": [{ "erp_code", "price_cents", "promo_price_cents"?, "promo_starts_on"?, "promo_ends_on"?, "quantity" }]
-- }
-- New products are created only with a weight (shipping is priced by weight); name, brand, category and
-- photos are then curated in the admin and not overwritten. Rows older than the last sync are ignored.
-- ---------------------------------------------------------------------------
create or replace function public.erp_slug(p_name text, p_code text)
returns text language sql immutable set search_path = '' as $$
  select left(coalesce(nullif(trim(both '-' from regexp_replace(lower(translate(p_name,
    'àáâäèéêëìíîïòóôöùúûüçñÀÁÂÄÈÉÊËÌÍÎÏÒÓÔÖÙÚÛÜÇÑ', 'aaaaeeeeiiiioooouuuucnAAAAEEEEIIIIOOOOUUUUCN')), '[^a-z0-9]+', '-', 'g')), ''), 'prodotto'), 60)
    || '-' || lower(regexp_replace(p_code, '[^A-Za-z0-9]+', '-', 'g'))
$$;

create or replace function public.erp_apply_batch(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_store public.stores;
  v_sent timestamptz;
  v_row jsonb;
  v_code text;
  v_product public.products;
  v_inv public.inventory;
  v_created integer := 0;
  v_updated integer := 0;
  v_items integer := 0;
  v_stale integer := 0;
  v_skipped jsonb := '[]'::jsonb;
  v_price integer;
  v_promo integer;
  v_qty integer;
  v_vat numeric;
  v_barcode text;
begin
  select * into v_store from public.stores where code = upper(p ->> 'store_code');
  if not found then raise exception 'invalid_store' using errcode = 'P0001'; end if;
  begin
    v_sent := coalesce((p ->> 'sent_at')::timestamptz, now());
  exception when others then
    raise exception 'invalid_sent_at' using errcode = 'P0001';
  end;
  if v_sent > now() + interval '10 minutes' then raise exception 'invalid_sent_at' using errcode = 'P0001'; end if;
  if jsonb_array_length(coalesce(p -> 'products', '[]')) > 2000 or jsonb_array_length(coalesce(p -> 'store_items', '[]')) > 5000 then
    raise exception 'batch_too_large' using errcode = 'P0001';
  end if;

  -- Products
  for v_row in select * from jsonb_array_elements(coalesce(p -> 'products', '[]')) loop
    v_code := nullif(trim(v_row ->> 'erp_code'), '');
    if v_code is null or v_code !~ '^[A-Za-z0-9._-]{1,40}$' then
      v_skipped := v_skipped || jsonb_build_object('erp_code', v_code, 'reason', 'invalid_code'); continue;
    end if;
    begin
      v_price := (v_row ->> 'price_cents')::integer;
      v_vat := coalesce((v_row ->> 'vat_rate')::numeric, 22);
    exception when others then
      v_skipped := v_skipped || jsonb_build_object('erp_code', v_code, 'reason', 'invalid_number'); continue;
    end;
    if v_vat not in (0, 4, 5, 10, 22) then
      v_skipped := v_skipped || jsonb_build_object('erp_code', v_code, 'reason', 'invalid_vat'); continue;
    end if;
    v_barcode := nullif(regexp_replace(coalesce(v_row ->> 'barcode', ''), '\s', '', 'g'), '');
    if v_barcode !~ '^\d{8,14}$' then v_barcode := null; end if;

    begin
    select * into v_product from public.products where erp_code = v_code;
    if found then
      update public.products set
        vat_rate = v_vat,
        active = case when v_row ? 'active' then (v_row ->> 'active')::boolean else active end,
        barcode = coalesce(barcode, v_barcode),
        weight_g = coalesce(nullif((v_row ->> 'weight_g')::integer, 0), weight_g)
      where id = v_product.id;
      v_updated := v_updated + 1;
    else
      if coalesce(v_price, 0) <= 0 then
        v_skipped := v_skipped || jsonb_build_object('erp_code', v_code, 'reason', 'missing_price'); continue;
      end if;
      if coalesce((v_row ->> 'weight_g')::integer, 0) <= 0 then
        v_skipped := v_skipped || jsonb_build_object('erp_code', v_code, 'reason', 'missing_weight'); continue;
      end if;
      if nullif(trim(v_row ->> 'name'), '') is null then
        v_skipped := v_skipped || jsonb_build_object('erp_code', v_code, 'reason', 'missing_name'); continue;
      end if;
      begin
        insert into public.products (sku, slug, name, brand, price_cents, vat_rate, weight_g, barcode, erp_code, active)
        values (v_code, public.erp_slug(v_row ->> 'name', v_code), left(trim(v_row ->> 'name'), 200),
                nullif(trim(v_row ->> 'brand'), ''), v_price, v_vat, (v_row ->> 'weight_g')::integer, v_barcode, v_code,
                coalesce((v_row ->> 'active')::boolean, true));
        v_created := v_created + 1;
      exception when unique_violation then
        v_skipped := v_skipped || jsonb_build_object('erp_code', v_code, 'reason', 'sku_taken'); continue;
      end;
    end if;
    exception when others then
      v_skipped := v_skipped || jsonb_build_object('erp_code', v_code, 'reason', 'invalid_product');
    end;
  end loop;

  -- Store prices, promotions and stock
  perform set_config('app.inventory_reason', 'erp_sync', true);
  for v_row in select * from jsonb_array_elements(coalesce(p -> 'store_items', '[]')) loop
    v_code := nullif(trim(v_row ->> 'erp_code'), '');
    select * into v_product from public.products where erp_code = v_code;
    if not found then
      v_skipped := v_skipped || jsonb_build_object('erp_code', v_code, 'reason', 'unknown_product'); continue;
    end if;
    begin
      v_price := nullif((v_row ->> 'price_cents')::integer, 0);
      v_promo := nullif((v_row ->> 'promo_price_cents')::integer, 0);
      v_qty := greatest(coalesce((v_row ->> 'quantity')::integer, 0), 0);
      if (v_price is not null and v_price < 0) or (v_promo is not null and v_promo < 0) then raise exception 'neg'; end if;
      select * into v_inv from public.inventory where store_id = v_store.id and product_id = v_product.id;
      if found and v_inv.erp_synced_at is not null and v_inv.erp_synced_at > v_sent then
        v_stale := v_stale + 1; continue;
      end if;
      insert into public.inventory as i (store_id, product_id, quantity, price_cents, promo_price_cents,
        promo_starts_on, promo_ends_on, erp_quantity, erp_synced_at)
      values (v_store.id, v_product.id, greatest(v_qty - public.pos_pending_quantity(v_store.id, v_product.id), 0),
        v_price, v_promo, (v_row ->> 'promo_starts_on')::date, (v_row ->> 'promo_ends_on')::date, v_qty, v_sent)
      on conflict (store_id, product_id) do update set
        quantity = excluded.quantity, price_cents = excluded.price_cents, promo_price_cents = excluded.promo_price_cents,
        promo_starts_on = excluded.promo_starts_on, promo_ends_on = excluded.promo_ends_on,
        erp_quantity = excluded.erp_quantity, erp_synced_at = excluded.erp_synced_at;
      v_items := v_items + 1;
    exception when others then
      v_skipped := v_skipped || jsonb_build_object('erp_code', v_code, 'reason', 'invalid_store_item'); continue;
    end;
  end loop;
  perform set_config('app.inventory_reason', '', true);

  perform public.refresh_display_prices();
  return jsonb_build_object('store_code', v_store.code, 'created', v_created, 'updated', v_updated,
    'store_items', v_items, 'stale', v_stale, 'skipped', v_skipped);
end $$;

-- ---------------------------------------------------------------------------
-- Till registration of online orders (store staff of the order's store, managers, admins).
-- ---------------------------------------------------------------------------
create or replace function public.set_pos_registered(p_order_id uuid, p_registered boolean)
returns public.orders language plpgsql security definer set search_path = '' as $$
declare
  v_order public.orders;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found or not public.staff_can_access_store(v_order.store_id) then
    raise exception 'order_not_found' using errcode = 'P0001';
  end if;
  if v_order.payment_status = 'unpaid' or v_order.status in ('pending_payment', 'cancelled') then
    raise exception 'order_not_paid' using errcode = 'P0001';
  end if;
  update public.orders set
    pos_registered_at = case when p_registered then coalesce(pos_registered_at, now()) end,
    pos_registered_by = case when p_registered then coalesce(pos_registered_by, auth.uid()) end
  where id = p_order_id returning * into v_order;
  insert into public.order_events (order_id, kind, note, actor_id, visible_to_customer)
  values (p_order_id, 'note', case when p_registered then 'Registrato in cassa' else 'Registrazione in cassa annullata' end,
          auth.uid(), false);
  return v_order;
end $$;

-- Function privileges (Supabase grants EXECUTE to anon/authenticated by default).
revoke all on function public.shop_today() from public, anon;
revoke all on function public.store_unit_price(integer, integer, integer, integer, date, date, date) from public, anon;
revoke all on function public.pos_pending_quantity(uuid, uuid) from public, anon, authenticated;
revoke all on function public.refresh_display_prices() from public, anon, authenticated;
revoke all on function public.erp_slug(text, text) from public, anon, authenticated;
revoke all on function public.erp_apply_batch(jsonb) from public, anon, authenticated;
revoke all on function public.set_pos_registered(uuid, boolean) from public, anon;
grant execute on function public.shop_today(), public.store_unit_price(integer, integer, integer, integer, date, date, date)
  to anon, authenticated, service_role;
grant execute on function public.quote_cart(jsonb) to anon, authenticated;
grant execute on function public.set_pos_registered(uuid, boolean) to authenticated, service_role;
grant execute on function public.pos_pending_quantity(uuid, uuid), public.refresh_display_prices(), public.erp_slug(text, text),
  public.erp_apply_batch(jsonb) to service_role;

-- Promotions start and end at midnight: refresh listing prices every 15 minutes.
do $$
begin
  create extension if not exists pg_cron with schema pg_catalog;
  perform cron.schedule('casa-te-refresh-display-prices', '*/15 * * * *', 'select public.refresh_display_prices()');
exception when others then
  raise notice 'pg_cron not available: schedule public.refresh_display_prices() externally (%).', sqlerrm;
end $$;
