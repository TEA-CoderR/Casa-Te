-- Club member prices ("Prezzo Soci") from the ERP.
-- * inventory.member_price_cents / member_price_ends_on: per-store member price (ERP: prodotti.PrezzoVedi3, or a
--   dated prodotti_vip row). Valid while ends_on is null or >= today (Europe/Rome) and lower than the price that
--   would be charged otherwise (store price or running promo).
-- * products.member_price_cents / member_price_ends_on: listing copy from the main online store, refreshed with the
--   display prices, so the shop can show "Prezzo Soci" to everyone and invite non-members to join or link a card.
-- * quote_cart charges the member price only to Club members (is_club_member()); every line also reports the
--   member price and the quote reports member_savings_cents (members) / member_savings_available_cents (others).
-- * erp_apply_batch accepts member_price_cents / member_price_ends_on in store_items (absent key = unchanged).
-- quote_cart and erp_apply_batch below are copies of 20261013000003 with only those changes.

alter table public.inventory
  add column member_price_cents integer check (member_price_cents is null or member_price_cents > 0),
  add column member_price_ends_on date;

alter table public.products
  add column member_price_cents integer check (member_price_cents is null or member_price_cents > 0),
  add column member_price_ends_on date;
create index products_member_price_idx on public.products (id) where member_price_cents is not null and active;

-- Member price if valid today and lower than the price otherwise charged, else that price.
create or replace function public.member_unit_price(p_price_cents integer, p_member_cents integer, p_ends_on date, p_today date)
returns integer language sql immutable set search_path = '' as $$
  select case when p_member_cents is not null and p_member_cents < p_price_cents
                and (p_ends_on is null or p_ends_on >= p_today) then p_member_cents else p_price_cents end
$$;

create or replace function public.refresh_display_prices()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_store uuid;
  v_count integer;
  v_today date := public.shop_today();
begin
  select id into v_store from public.stores where active order by sort, code limit 1;
  if v_store is null then return 0; end if;
  with eff as (
    select pr.id, sp.price_cents, sp.compare_at_price_cents,
           case when mp < sp.price_cents then mp end as member_cents,
           case when mp < sp.price_cents then i.member_price_ends_on end as member_ends
    from public.products pr
    join public.inventory i on i.product_id = pr.id and i.store_id = v_store and i.price_cents is not null
    cross join lateral public.store_unit_price(pr.price_cents, pr.compare_at_price_cents, i.price_cents,
      i.promo_price_cents, i.promo_starts_on, i.promo_ends_on, v_today) sp
    cross join lateral public.member_unit_price(sp.price_cents, i.member_price_cents, i.member_price_ends_on, v_today) m(mp)
    where pr.erp_code is not null
  )
  update public.products pr set price_cents = eff.price_cents, compare_at_price_cents = eff.compare_at_price_cents,
    member_price_cents = eff.member_cents, member_price_ends_on = eff.member_ends
  from eff
  where pr.id = eff.id and (pr.price_cents, pr.compare_at_price_cents, pr.member_price_cents, pr.member_price_ends_on)
    is distinct from (eff.price_cents, eff.compare_at_price_cents, eff.member_cents, eff.member_ends);
  get diagnostics v_count = row_count;
  return v_count;
end $$;

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
  v_weight_missing boolean;
  v_member boolean := public.is_club_member();
  v_member_savings integer;
  v_member_available integer;
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
             case when v_member then mp.member_cents else sp.price_cents end as price_cents,
             sp.price_cents as regular_cents, mp.member_cents, pr.vat_rate, coalesce(pr.weight_g, 0) as weight_g, pr.weight_g is null as no_weight, r.quantity,
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
      left join lateral (select public.member_unit_price(sp.price_cents, i.member_price_cents, i.member_price_ends_on, v_today)
        as member_cents) mp on true
    )
    select
      coalesce(jsonb_agg(jsonb_build_object(
        'product_id', product_id, 'sku', sku, 'name', name, 'image_path', image_path,
        'unit_price_cents', price_cents, 'regular_unit_price_cents', regular_cents,
        'member_unit_price_cents', case when member_cents < regular_cents then member_cents end,
        'member_price_applied', v_member and member_cents < regular_cents, 'vat_rate', vat_rate, 'weight_g', weight_g,
        'quantity', quantity, 'line_total_cents', case when issue is null then price_cents * quantity else 0 end,
        'available_quantity', available, 'issue', issue) order by name), '[]'::jsonb),
      coalesce(sum(price_cents * quantity) filter (where issue is null), 0),
      coalesce(sum(weight_g * quantity) filter (where issue is null), 0),
      coalesce(sum(quantity) filter (where issue is null), 0),
      count(*) filter (where issue is not null),
      coalesce(bool_or(no_weight) filter (where issue is null), false),
      coalesce(sum((regular_cents - member_cents) * quantity) filter (where issue is null), 0)
    into v_lines, v_subtotal, v_weight, v_count, v_issue_count, v_weight_missing, v_member_available
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
       or (v_method = 'pickup' and not v_has_pickup_points)
       or (v_method in ('home', 'pickup') and v_weight_missing) then
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
    'weight_missing', v_weight_missing,
    'club_member', v_member,
    'member_savings_cents', case when v_member then v_member_available else 0 end,
    'member_savings_available_cents', case when v_member then 0 else v_member_available end,
    'coupon', case when v_coupon_error is null and v_coupon.id is not null then
      jsonb_build_object('code', v_coupon.code, 'kind', v_coupon.kind, 'value', v_coupon.value, 'description', v_coupon.description) end,
    'coupon_error', v_coupon_error,
    'shipping', v_ship,
    'fulfilment', v_fulfilment,
    'shipping_cents', v_shipping,
    'total_cents', case when v_fulfilment is null or v_shipping is null then null else v_goods + v_shipping end
  );
end $$;

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
  v_member integer;
  v_member_ends date;
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
        vat_rate = case when v_row ? 'vat_rate' then v_vat else vat_rate end,
        active = case when v_row ? 'active' then (v_row ->> 'active')::boolean else active end,
        barcode = coalesce(barcode, v_barcode),
        weight_g = coalesce(nullif((v_row ->> 'weight_g')::integer, 0), weight_g)
      where id = v_product.id;
      v_updated := v_updated + 1;
    else
      if coalesce(v_price, 0) <= 0 then
        v_skipped := v_skipped || jsonb_build_object('erp_code', v_code, 'reason', 'missing_price'); continue;
      end if;
      if nullif(trim(v_row ->> 'name'), '') is null then
        v_skipped := v_skipped || jsonb_build_object('erp_code', v_code, 'reason', 'missing_name'); continue;
      end if;
      begin
        insert into public.products (sku, slug, name, brand, price_cents, vat_rate, weight_g, barcode, erp_code, active)
        values (v_code, public.erp_slug(v_row ->> 'name', v_code), left(trim(v_row ->> 'name'), 200),
                nullif(trim(v_row ->> 'brand'), ''), v_price, v_vat, nullif((v_row ->> 'weight_g')::integer, 0), v_barcode, v_code,
                coalesce((v_row ->> 'active')::boolean, true))
        returning * into v_product;
        v_created := v_created + 1;
      exception when unique_violation then
        v_skipped := v_skipped || jsonb_build_object('erp_code', v_code, 'reason', 'sku_taken'); continue;
      end;
    end if;
    -- Photo hosted elsewhere (https URL): used only while the product has no photo of its own.
    if coalesce(v_row ->> 'image_url', '') ~ '^https://[^\s]+$' and length(v_row ->> 'image_url') <= 500
       and not exists (select 1 from public.product_images pi where pi.product_id = v_product.id) then
      insert into public.product_images (product_id, path, alt, sort) values (v_product.id, v_row ->> 'image_url', v_product.name, 0);
    end if;
    exception when others then
      v_skipped := v_skipped || jsonb_build_object('erp_code', v_code, 'reason', 'invalid_product', 'detail', left(sqlerrm, 200));
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
      -- Member (Club) price: rows without the key (older agents) keep the stored one.
      if v_row ? 'member_price_cents' then
        v_member := nullif((v_row ->> 'member_price_cents')::integer, 0);
        v_member_ends := case when v_member is not null then (v_row ->> 'member_price_ends_on')::date end;
        if v_member is not null and v_member < 0 then raise exception 'neg'; end if;
      else
        v_member := v_inv.member_price_cents;
        v_member_ends := v_inv.member_price_ends_on;
      end if;
      if found and v_inv.erp_synced_at is not null and v_inv.erp_synced_at > v_sent then
        v_stale := v_stale + 1; continue;
      end if;
      insert into public.inventory as i (store_id, product_id, quantity, price_cents, promo_price_cents,
        promo_starts_on, promo_ends_on, member_price_cents, member_price_ends_on, erp_quantity, erp_synced_at)
      values (v_store.id, v_product.id, greatest(v_qty - public.pos_pending_quantity(v_store.id, v_product.id), 0),
        v_price, v_promo, (v_row ->> 'promo_starts_on')::date, (v_row ->> 'promo_ends_on')::date, v_member, v_member_ends,
        v_qty, v_sent)
      on conflict (store_id, product_id) do update set
        quantity = excluded.quantity, price_cents = excluded.price_cents, promo_price_cents = excluded.promo_price_cents,
        promo_starts_on = excluded.promo_starts_on, promo_ends_on = excluded.promo_ends_on,
        member_price_cents = excluded.member_price_cents, member_price_ends_on = excluded.member_price_ends_on,
        erp_quantity = excluded.erp_quantity, erp_synced_at = excluded.erp_synced_at;
      v_items := v_items + 1;
    exception when others then
      v_skipped := v_skipped || jsonb_build_object('erp_code', v_code, 'reason', 'invalid_store_item', 'detail', left(sqlerrm, 200)); continue;
    end;
  end loop;
  perform set_config('app.inventory_reason', '', true);

  perform public.refresh_display_prices();
  return jsonb_build_object('store_code', v_store.code, 'created', v_created, 'updated', v_updated,
    'store_items', v_items, 'stale', v_stale, 'skipped', v_skipped);
end $$;

revoke all on function public.member_unit_price(integer, integer, date, date) from public;
grant execute on function public.member_unit_price(integer, integer, date, date) to anon, authenticated, service_role;
revoke all on function public.refresh_display_prices() from public, anon, authenticated;
grant execute on function public.refresh_display_prices() to service_role;
grant execute on function public.quote_cart(jsonb) to anon, authenticated;
revoke all on function public.erp_apply_batch(jsonb) from public, anon, authenticated;
grant execute on function public.erp_apply_batch(jsonb) to service_role;
