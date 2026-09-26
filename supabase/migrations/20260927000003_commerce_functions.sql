-- Server-side commerce logic. Prices, discounts, shipping and stock are ALWAYS computed here;
-- amounts sent by clients are never trusted.

-- ---------------------------------------------------------------------------
-- Inventory audit trail: every stock change is logged with a reason.
-- Functions set `app.inventory_reason` / `app.order_id` locally before touching stock.
-- ---------------------------------------------------------------------------
create or replace function public.log_inventory_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_reason text := nullif(current_setting('app.inventory_reason', true), '');
  v_order uuid := nullif(current_setting('app.order_id', true), '')::uuid;
  v_delta integer := new.quantity - coalesce(case when tg_op = 'UPDATE' then old.quantity end, 0);
begin
  if v_delta = 0 then return new; end if;
  if v_reason is null or v_reason not in ('order_reserve', 'order_release', 'manual', 'import', 'stocktake') then
    v_reason := 'manual';
  end if;
  insert into public.inventory_movements (store_id, product_id, delta, reason, order_id, actor_id)
  values (new.store_id, new.product_id, v_delta, v_reason, v_order, auth.uid());
  return new;
end $$;

create trigger inventory_audit after insert or update of quantity on public.inventory
  for each row execute function public.log_inventory_change();

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.slugify(p text)
returns text language sql immutable set search_path = '' as $$
  select trim(both '-' from regexp_replace(
    translate(lower(coalesce(p, '')), 'àáâäãèéêëìíîïòóôöõùúûüçñ', 'aaaaaeeeeiiiiooooouuuucn'),
    '[^a-z0-9]+', '-', 'g'))
$$;

create or replace function public.format_euro(p_cents integer)
returns text language sql immutable set search_path = '' as $$
  select '€' || replace(to_char(p_cents / 100.0, 'FM999999990.00'), '.', ',')
$$;

-- Shipping price for a method/subtotal/weight. Mirrors packages/shared/src/shipping.ts.
-- Returns no row when the method is not available for that cart.
create or replace function public.shipping_cost_cents(p_method text, p_subtotal_cents integer, p_weight_g integer)
returns table (price_cents integer, provisional boolean)
language sql stable set search_path = '' as $$
  select 0, false where p_method = 'store'
  union all
  select * from (
    select r.price_cents, r.provisional
    from public.shipping_rates r
    where p_method in ('home', 'pickup')
      and r.active
      and r.method = p_method
      and p_subtotal_cents >= r.min_subtotal_cents
      and (r.max_subtotal_cents is null or p_subtotal_cents <= r.max_subtotal_cents)
      and p_weight_g >= r.min_weight_g
      and (r.max_weight_g is null or p_weight_g <= r.max_weight_g)
    order by r.priority, r.price_cents
    limit 1
  ) m
$$;

-- ---------------------------------------------------------------------------
-- quote_cart: authoritative price quote. Callable by anyone (used for cart display).
-- Input:  { store_id, items: [{product_id, quantity}], fulfilment?, coupon_code? }
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
             sum(least(greatest((e ->> 'quantity')::bigint, -1), 1000))::integer as quantity
      from jsonb_array_elements(p -> 'items') e
      group by 1
    ), priced as (
      select r.product_id, pr.sku, coalesce(pr.name, 'Prodotto non disponibile') as name,
             pr.price_cents, pr.vat_rate, pr.weight_g, r.quantity,
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
-- Stock helpers
-- ---------------------------------------------------------------------------
create or replace function public._restock_order(p_order public.orders)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('app.inventory_reason', 'order_release', true);
  perform set_config('app.order_id', p_order.id::text, true);
  insert into public.inventory (store_id, product_id, quantity)
  select p_order.store_id, oi.product_id, sum(oi.quantity)
  from public.order_items oi
  where oi.order_id = p_order.id and oi.product_id is not null
    and exists (select 1 from public.products pr where pr.id = oi.product_id)
  group by oi.product_id
  on conflict (store_id, product_id) do update set quantity = public.inventory.quantity + excluded.quantity;
  perform set_config('app.inventory_reason', '', true);
  perform set_config('app.order_id', '', true);
end $$;

-- ---------------------------------------------------------------------------
-- create_order: validates, reserves stock and creates a pending_payment order.
-- Input: quote_cart input + { fulfilment, address?, pickup_point_id?, notes?, invoice? , phone? }
-- ---------------------------------------------------------------------------
create or replace function public.create_order(p jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_q jsonb;
  v_fulfilment text := p ->> 'fulfilment';
  v_order public.orders;
  v_addr jsonb;
  v_pp public.pickup_points;
  v_pp_snapshot jsonb;
  v_email text;
  v_name text;
  v_phone text;
  v_pending integer;
  v_line jsonb;
  v_coupon_id uuid;
  v_invoice jsonb;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = 'P0001'; end if;
  if v_fulfilment is null or v_fulfilment not in ('home', 'pickup', 'store') then
    raise exception 'invalid_fulfilment' using errcode = 'P0001';
  end if;

  select count(*) into v_pending from public.orders
  where user_id = v_uid and status = 'pending_payment' and expires_at > now();
  if v_pending >= 3 then raise exception 'too_many_pending_orders' using errcode = 'P0001'; end if;

  v_q := public.quote_cart(p);
  if (v_q ->> 'issue_count')::integer > 0 then raise exception 'cart_has_issues' using errcode = 'P0001'; end if;
  if v_q ->> 'coupon_error' is not null then raise exception '%', v_q ->> 'coupon_error' using errcode = 'P0001'; end if;
  if v_q ->> 'shipping_cents' is null then raise exception 'shipping_unavailable' using errcode = 'P0001'; end if;
  if (v_q ->> 'total_cents')::integer < 50 then raise exception 'total_too_low' using errcode = 'P0001'; end if;

  select email into v_email from auth.users where id = v_uid;
  select full_name, phone into v_name, v_phone from public.profiles where id = v_uid;
  v_phone := coalesce(nullif(trim(p ->> 'phone'), ''), v_phone);

  if v_fulfilment = 'home' then
    v_addr := p -> 'address';
    if v_addr is null
       or length(trim(coalesce(v_addr ->> 'full_name', ''))) < 2
       or length(trim(coalesce(v_addr ->> 'line1', ''))) < 3
       or length(trim(coalesce(v_addr ->> 'city', ''))) < 2
       or coalesce(v_addr ->> 'province', '') !~ '^[A-Za-z]{2}$'
       or coalesce(v_addr ->> 'postal_code', '') !~ '^\d{5}$'
       or length(regexp_replace(coalesce(v_addr ->> 'phone', ''), '\D', '', 'g')) < 6 then
      raise exception 'invalid_address' using errcode = 'P0001';
    end if;
    v_addr := jsonb_build_object(
      'full_name', trim(v_addr ->> 'full_name'), 'line1', trim(v_addr ->> 'line1'),
      'line2', nullif(trim(coalesce(v_addr ->> 'line2', '')), ''), 'city', trim(v_addr ->> 'city'),
      'province', upper(v_addr ->> 'province'), 'postal_code', v_addr ->> 'postal_code',
      'phone', trim(v_addr ->> 'phone'), 'country', 'IT');
    v_name := v_addr ->> 'full_name';
    v_phone := v_addr ->> 'phone';
  elsif v_fulfilment = 'pickup' then
    begin
      select * into v_pp from public.pickup_points where id = (p ->> 'pickup_point_id')::uuid and active;
    exception when invalid_text_representation then v_pp := null;
    end;
    if v_pp.id is null then raise exception 'invalid_pickup_point' using errcode = 'P0001'; end if;
    v_pp_snapshot := jsonb_build_object('name', v_pp.name, 'carrier', v_pp.carrier, 'address', v_pp.address,
      'city', v_pp.city, 'postal_code', v_pp.postal_code, 'province', v_pp.province);
  end if;

  if v_fulfilment <> 'home' then
    v_name := coalesce(nullif(trim(p ->> 'full_name'), ''), v_name);
  end if;
  if v_name is null or length(trim(v_name)) < 2 then raise exception 'name_required' using errcode = 'P0001'; end if;
  if v_phone is null or length(regexp_replace(v_phone, '\D', '', 'g')) < 6 then
    raise exception 'phone_required' using errcode = 'P0001';
  end if;

  if coalesce((p ->> 'invoice_requested')::boolean, false) then
    v_invoice := p -> 'invoice';
    if v_invoice is null or (
      coalesce(v_invoice ->> 'tax_code', '') !~* '^[A-Z0-9]{16}$'
      and coalesce(v_invoice ->> 'vat_number', '') !~ '^(IT)?\d{11}$') then
      raise exception 'invalid_invoice_details' using errcode = 'P0001';
    end if;
    v_invoice := jsonb_strip_nulls(jsonb_build_object(
      'company_name', nullif(trim(coalesce(v_invoice ->> 'company_name', '')), ''),
      'tax_code', nullif(upper(trim(coalesce(v_invoice ->> 'tax_code', ''))), ''),
      'vat_number', nullif(upper(trim(coalesce(v_invoice ->> 'vat_number', ''))), ''),
      'sdi_code', nullif(upper(trim(coalesce(v_invoice ->> 'sdi_code', ''))), ''),
      'pec', nullif(trim(coalesce(v_invoice ->> 'pec', '')), ''),
      'address', v_invoice -> 'address'));
  end if;

  if v_q -> 'coupon' is not null and v_q -> 'coupon' <> 'null'::jsonb then
    select id into v_coupon_id from public.coupons where code = v_q -> 'coupon' ->> 'code';
  end if;

  insert into public.orders (
    user_id, store_id, fulfilment, subtotal_cents, discount_cents, shipping_cents, total_cents,
    total_weight_g, shipping_provisional, coupon_id, coupon_code, customer_email, customer_name, customer_phone,
    shipping_address, pickup_point_id, pickup_point_snapshot, invoice_requested, invoice_details, notes)
  values (
    v_uid, (v_q ->> 'store_id')::uuid, v_fulfilment,
    (v_q ->> 'subtotal_cents')::integer, (v_q ->> 'discount_cents')::integer,
    (v_q ->> 'shipping_cents')::integer, (v_q ->> 'total_cents')::integer,
    (v_q ->> 'total_weight_g')::integer,
    coalesce((v_q -> 'shipping' -> v_fulfilment ->> 'provisional')::boolean, false),
    v_coupon_id, v_q -> 'coupon' ->> 'code', v_email, trim(v_name), trim(v_phone),
    v_addr, v_pp.id, v_pp_snapshot, v_invoice is not null, v_invoice,
    nullif(left(trim(coalesce(p ->> 'notes', '')), 500), ''))
  returning * into v_order;

  -- Reserve stock (ordered by product id to avoid deadlocks between concurrent orders).
  perform set_config('app.inventory_reason', 'order_reserve', true);
  perform set_config('app.order_id', v_order.id::text, true);
  for v_line in
    select l from jsonb_array_elements(v_q -> 'lines') l order by l ->> 'product_id'
  loop
    update public.inventory
       set quantity = quantity - (v_line ->> 'quantity')::integer
     where store_id = v_order.store_id
       and product_id = (v_line ->> 'product_id')::uuid
       and quantity >= (v_line ->> 'quantity')::integer;
    if not found then raise exception 'insufficient_stock' using errcode = 'P0001'; end if;

    insert into public.order_items (order_id, product_id, sku, name, image_path, unit_price_cents,
                                    vat_rate, weight_g, quantity, line_total_cents)
    values (v_order.id, (v_line ->> 'product_id')::uuid, v_line ->> 'sku', v_line ->> 'name',
            v_line ->> 'image_path', (v_line ->> 'unit_price_cents')::integer,
            (v_line ->> 'vat_rate')::numeric, (v_line ->> 'weight_g')::integer,
            (v_line ->> 'quantity')::integer, (v_line ->> 'line_total_cents')::integer);
  end loop;
  perform set_config('app.inventory_reason', '', true);
  perform set_config('app.order_id', '', true);

  insert into public.order_events (order_id, status, kind, note, actor_id)
  values (v_order.id, 'pending_payment', 'status', 'Ordine creato, in attesa di pagamento', v_uid);

  return jsonb_build_object(
    'id', v_order.id, 'order_number', v_order.order_number, 'total_cents', v_order.total_cents,
    'customer_email', v_order.customer_email, 'expires_at', v_order.expires_at);
end $$;

-- ---------------------------------------------------------------------------
-- Payment lifecycle (service role only — called from Edge Functions)
-- ---------------------------------------------------------------------------
create or replace function public.attach_checkout_session(p_order_id uuid, p_session_id text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.orders set stripe_checkout_session_id = p_session_id
  where id = p_order_id and status = 'pending_payment';
  if not found then raise exception 'order_not_pending' using errcode = 'P0001'; end if;
end $$;

create or replace function public.release_order(p_order_id uuid, p_reason text default 'Pagamento non completato')
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_order public.orders;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found or v_order.status <> 'pending_payment' then return false; end if;
  perform public._restock_order(v_order);
  update public.orders set status = 'cancelled', cancelled_at = now() where id = p_order_id;
  insert into public.order_events (order_id, status, kind, note)
  values (p_order_id, 'cancelled', 'status', coalesce(p_reason, 'Ordine annullato'));
  return true;
end $$;

create or replace function public.expire_stale_orders()
returns integer language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_count integer := 0;
begin
  for v_id in
    select id from public.orders
    where status = 'pending_payment' and expires_at < now()
    order by expires_at limit 500
  loop
    if public.release_order(v_id, 'Tempo per il pagamento scaduto') then v_count := v_count + 1; end if;
  end loop;
  return v_count;
end $$;

-- Returns 'paid' | 'already_paid' | 'needs_refund' (paid after the order expired and stock was released).
create or replace function public.mark_order_paid(
  p_order_id uuid, p_session_id text, p_payment_intent_id text, p_amount_cents integer)
returns text language plpgsql security definer set search_path = '' as $$
declare v_order public.orders;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'order_not_found' using errcode = 'P0001'; end if;
  if v_order.payment_status in ('paid', 'partially_refunded', 'refunded') then return 'already_paid'; end if;
  if p_amount_cents is distinct from v_order.total_cents then
    raise exception 'amount_mismatch' using errcode = 'P0001';
  end if;

  if v_order.status = 'cancelled' then
    update public.orders set payment_status = 'paid', paid_at = now(),
      stripe_checkout_session_id = coalesce(p_session_id, stripe_checkout_session_id),
      stripe_payment_intent_id = p_payment_intent_id
    where id = p_order_id;
    insert into public.order_events (order_id, kind, note, visible_to_customer)
    values (p_order_id, 'payment', 'Pagamento ricevuto dopo la scadenza dell''ordine: rimborso automatico', true);
    return 'needs_refund';
  end if;

  update public.orders set status = 'paid', payment_status = 'paid', paid_at = now(),
    stripe_checkout_session_id = coalesce(p_session_id, stripe_checkout_session_id),
    stripe_payment_intent_id = p_payment_intent_id
  where id = p_order_id;
  if v_order.coupon_id is not null then
    update public.coupons set redemptions = redemptions + 1 where id = v_order.coupon_id;
  end if;
  insert into public.order_events (order_id, status, kind, note)
  values (p_order_id, 'paid', 'status', 'Pagamento ricevuto');
  return 'paid';
end $$;

-- Idempotent per Stripe refund id. Returns false if the refund was already recorded.
create or replace function public.record_refund(
  p_order_id uuid, p_amount_cents integer, p_stripe_refund_id text, p_reason text, p_actor uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_order public.orders; v_new integer;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'order_not_found' using errcode = 'P0001'; end if;
  if p_stripe_refund_id is not null and exists (select 1 from public.refunds where stripe_refund_id = p_stripe_refund_id) then
    return false;
  end if;
  if v_order.payment_status not in ('paid', 'partially_refunded') then
    raise exception 'order_not_refundable' using errcode = 'P0001';
  end if;
  v_new := v_order.refunded_cents + p_amount_cents;
  if p_amount_cents <= 0 or v_new > v_order.total_cents then
    raise exception 'invalid_refund_amount' using errcode = 'P0001';
  end if;
  insert into public.refunds (order_id, amount_cents, reason, stripe_refund_id, created_by)
  values (p_order_id, p_amount_cents, p_reason, p_stripe_refund_id, p_actor);
  update public.orders set refunded_cents = v_new,
    payment_status = case when v_new = total_cents then 'refunded' else 'partially_refunded' end
  where id = p_order_id;
  insert into public.order_events (order_id, kind, note, actor_id)
  values (p_order_id, 'refund', 'Rimborso di ' || public.format_euro(p_amount_cents) || ' emesso', p_actor);
  return true;
end $$;

-- ---------------------------------------------------------------------------
-- Customer actions
-- ---------------------------------------------------------------------------
create or replace function public.customer_cancel_pending_order(p_order_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.orders where id = p_order_id and user_id = auth.uid()) then
    raise exception 'order_not_found' using errcode = 'P0001';
  end if;
  return public.release_order(p_order_id, 'Annullato dal cliente prima del pagamento');
end $$;

-- ---------------------------------------------------------------------------
-- Staff actions
-- ---------------------------------------------------------------------------
create or replace function public.staff_set_order_status(
  p_order_id uuid, p_status text, p_note text default null,
  p_carrier text default null, p_tracking_number text default null, p_tracking_url text default null)
returns public.orders language plpgsql security definer set search_path = '' as $$
declare
  v_order public.orders;
  v_allowed text[];
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found or not public.staff_can_access_store(v_order.store_id) then
    raise exception 'order_not_found' using errcode = 'P0001';
  end if;

  v_allowed := case v_order.status
    when 'paid' then array['picking', 'cancelled']
    when 'picking' then array['ready', 'cancelled']
    when 'ready' then case when v_order.fulfilment = 'store' then array['completed', 'cancelled']
                           else array['shipped', 'cancelled'] end
    when 'shipped' then array['completed']
    else array[]::text[] end;
  if not (p_status = any (v_allowed)) then
    raise exception 'invalid_transition' using errcode = 'P0001';
  end if;

  if p_status = 'cancelled' then
    if not public.is_manager() then raise exception 'forbidden' using errcode = 'P0001'; end if;
    if v_order.payment_status in ('paid', 'partially_refunded') then
      raise exception 'refund_required' using errcode = 'P0001';
    end if;
    perform public._restock_order(v_order);
  end if;

  update public.orders set
    status = p_status,
    carrier = coalesce(nullif(trim(p_carrier), ''), carrier),
    tracking_number = coalesce(nullif(trim(p_tracking_number), ''), tracking_number),
    tracking_url = case when p_tracking_url ~ '^https://' then p_tracking_url else tracking_url end,
    completed_at = case when p_status = 'completed' then now() else completed_at end,
    cancelled_at = case when p_status = 'cancelled' then now() else cancelled_at end
  where id = p_order_id
  returning * into v_order;

  insert into public.order_events (order_id, status, kind, note, actor_id)
  values (p_order_id, p_status, 'status', nullif(trim(coalesce(p_note, '')), ''), auth.uid());
  return v_order;
end $$;

create or replace function public.staff_add_order_note(p_order_id uuid, p_note text, p_visible boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.orders o where o.id = p_order_id and public.staff_can_access_store(o.store_id)) then
    raise exception 'order_not_found' using errcode = 'P0001';
  end if;
  if length(trim(coalesce(p_note, ''))) = 0 then raise exception 'empty_note' using errcode = 'P0001'; end if;
  insert into public.order_events (order_id, kind, note, visible_to_customer, actor_id)
  values (p_order_id, 'note', left(trim(p_note), 1000), coalesce(p_visible, false), auth.uid());
end $$;

-- Stock count / adjustment with an explicit reason.
create or replace function public.staff_set_stock(p_store_id uuid, p_product_id uuid, p_quantity integer, p_reason text default 'stocktake')
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.staff_can_access_store(p_store_id) then raise exception 'forbidden' using errcode = 'P0001'; end if;
  if p_quantity is null or p_quantity < 0 then raise exception 'invalid_quantity' using errcode = 'P0001'; end if;
  perform set_config('app.inventory_reason', case when p_reason in ('stocktake', 'manual') then p_reason else 'manual' end, true);
  insert into public.inventory (store_id, product_id, quantity) values (p_store_id, p_product_id, p_quantity)
  on conflict (store_id, product_id) do update set quantity = excluded.quantity;
  perform set_config('app.inventory_reason', '', true);
end $$;

-- ---------------------------------------------------------------------------
-- Bulk product import (CSV parsed client-side into normalised JSON rows).
-- Row: { sku, name, category, price_cents, compare_at_price_cents?, vat_rate?, weight_g, barcode?,
--        brand?, description?, active?, featured?, max_per_order?, image_url?, stock?: {STORE_CODE: qty} }
-- ---------------------------------------------------------------------------
create or replace function public.admin_import_products(p_rows jsonb, p_dry_run boolean default true)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_row jsonb;
  v_idx integer := 0;
  v_report jsonb := '[]'::jsonb;
  v_created integer := 0;
  v_updated integer := 0;
  v_failed integer := 0;
  v_cat_id uuid;
  v_cat text;
  v_product_id uuid;
  v_inserted boolean;
  v_store_code text;
  v_qty text;
  v_store_id uuid;
begin
  if not public.is_manager() then raise exception 'forbidden' using errcode = 'P0001'; end if;
  if jsonb_typeof(p_rows) is distinct from 'array' then raise exception 'invalid_rows' using errcode = 'P0001'; end if;
  if jsonb_array_length(p_rows) > 2000 then raise exception 'too_many_rows' using errcode = 'P0001'; end if;

  begin
    perform set_config('app.inventory_reason', 'import', true);
    for v_row in select * from jsonb_array_elements(p_rows) loop
      v_idx := v_idx + 1;
      begin
        v_cat_id := null;
        v_cat := nullif(trim(coalesce(v_row ->> 'category', '')), '');
        if v_cat is not null then
          select id into v_cat_id from public.categories
          where slug = public.slugify(v_cat) or lower(name) = lower(v_cat) limit 1;
          if v_cat_id is null then
            insert into public.categories (slug, name) values (public.slugify(v_cat), v_cat) returning id into v_cat_id;
          end if;
        end if;

        insert into public.products as pr (sku, slug, name, description, brand, category_id, price_cents,
          compare_at_price_cents, vat_rate, weight_g, barcode, max_per_order, active, featured)
        values (
          trim(v_row ->> 'sku'),
          public.slugify(v_row ->> 'name') || '-' || lower(regexp_replace(trim(v_row ->> 'sku'), '[^A-Za-z0-9]', '', 'g')),
          trim(v_row ->> 'name'),
          nullif(trim(coalesce(v_row ->> 'description', '')), ''),
          nullif(trim(coalesce(v_row ->> 'brand', '')), ''),
          v_cat_id,
          (v_row ->> 'price_cents')::integer,
          nullif(v_row ->> 'compare_at_price_cents', '')::integer,
          coalesce(nullif(v_row ->> 'vat_rate', '')::numeric, 22),
          (v_row ->> 'weight_g')::integer,
          nullif(trim(coalesce(v_row ->> 'barcode', '')), ''),
          coalesce(nullif(v_row ->> 'max_per_order', '')::integer, 99),
          coalesce((v_row ->> 'active')::boolean, true),
          coalesce((v_row ->> 'featured')::boolean, false))
        on conflict (sku) do update set
          name = excluded.name, description = coalesce(excluded.description, pr.description),
          brand = coalesce(excluded.brand, pr.brand), category_id = coalesce(excluded.category_id, pr.category_id),
          price_cents = excluded.price_cents, compare_at_price_cents = excluded.compare_at_price_cents,
          vat_rate = excluded.vat_rate, weight_g = excluded.weight_g,
          barcode = coalesce(excluded.barcode, pr.barcode), max_per_order = excluded.max_per_order,
          active = excluded.active, featured = excluded.featured
        returning pr.id, (pr.xmax = 0) into v_product_id, v_inserted;

        if nullif(trim(coalesce(v_row ->> 'image_url', '')), '') is not null then
          if (v_row ->> 'image_url') !~ '^https://' then raise exception 'image_url must start with https://'; end if;
          insert into public.product_images (product_id, path, alt, sort)
          select v_product_id, v_row ->> 'image_url', trim(v_row ->> 'name'), 0
          where not exists (select 1 from public.product_images where product_id = v_product_id and path = v_row ->> 'image_url');
        end if;

        if jsonb_typeof(v_row -> 'stock') = 'object' then
          for v_store_code, v_qty in select * from jsonb_each_text(v_row -> 'stock') loop
            select id into v_store_id from public.stores where code = upper(v_store_code);
            if v_store_id is null then raise exception 'unknown store code %', v_store_code; end if;
            if v_qty !~ '^\d+$' then raise exception 'invalid stock for %', v_store_code; end if;
            insert into public.inventory (store_id, product_id, quantity) values (v_store_id, v_product_id, v_qty::integer)
            on conflict (store_id, product_id) do update set quantity = excluded.quantity;
          end loop;
        end if;

        if v_inserted then v_created := v_created + 1; else v_updated := v_updated + 1; end if;
        v_report := v_report || jsonb_build_object('row', v_idx, 'sku', v_row ->> 'sku',
          'result', case when v_inserted then 'created' else 'updated' end);
      exception when others then
        v_failed := v_failed + 1;
        v_report := v_report || jsonb_build_object('row', v_idx, 'sku', v_row ->> 'sku', 'result', 'error', 'error', sqlerrm);
      end;
    end loop;
    perform set_config('app.inventory_reason', '', true);
    if p_dry_run then raise exception 'dry_run_rollback'; end if;
  exception when others then
    if sqlerrm <> 'dry_run_rollback' then raise; end if;
  end;

  return jsonb_build_object('dry_run', p_dry_run, 'created', v_created, 'updated', v_updated,
                            'failed', v_failed, 'rows', v_report);
end $$;

-- ---------------------------------------------------------------------------
-- Dashboard KPIs. Store staff are restricted to their own store.
-- ---------------------------------------------------------------------------
create or replace function public.admin_dashboard(p_from timestamptz, p_to timestamptz, p_store_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_store uuid := p_store_id;
  v_result jsonb;
begin
  if not public.is_staff() then raise exception 'forbidden' using errcode = 'P0001'; end if;
  if public.staff_role() = 'store_staff' then v_store := public.staff_store_id(); end if;

  with paid as (
    select * from public.orders o
    where o.paid_at >= p_from and o.paid_at < p_to
      and (v_store is null or o.store_id = v_store)
  )
  select jsonb_build_object(
    'revenue_cents', coalesce((select sum(total_cents - refunded_cents) from paid), 0),
    'orders', (select count(*) from paid),
    'average_order_cents', coalesce((select round(avg(total_cents)) from paid), 0),
    'refunded_cents', coalesce((select sum(refunded_cents) from paid), 0),
    'by_fulfilment', coalesce((select jsonb_object_agg(fulfilment, n) from
        (select fulfilment, count(*) n from paid group by 1) f), '{}'::jsonb),
    'by_day', coalesce((select jsonb_agg(jsonb_build_object('day', d, 'revenue_cents', r, 'orders', n) order by d) from
        (select (paid_at at time zone 'Europe/Rome')::date d, sum(total_cents - refunded_cents) r, count(*) n
         from paid group by 1) x), '[]'::jsonb),
    'top_products', coalesce((select jsonb_agg(t) from
        (select oi.sku, oi.name, sum(oi.quantity) quantity, sum(oi.line_total_cents) revenue_cents
         from public.order_items oi join paid on paid.id = oi.order_id
         group by oi.sku, oi.name order by sum(oi.quantity) desc limit 10) t), '[]'::jsonb),
    'open_orders', coalesce((select jsonb_object_agg(status, n) from
        (select status, count(*) n from public.orders o
         where o.status in ('paid', 'picking', 'ready', 'shipped') and (v_store is null or o.store_id = v_store)
         group by 1) s), '{}'::jsonb),
    'low_stock', coalesce((select jsonb_agg(ls) from
        (select s.code store_code, pr.sku, pr.name, i.quantity
         from public.inventory i join public.products pr on pr.id = i.product_id and pr.active
         join public.stores s on s.id = i.store_id
         where i.quantity <= 3 and (v_store is null or i.store_id = v_store)
         order by i.quantity, pr.name limit 20) ls), '[]'::jsonb)
  ) into v_result;
  return v_result;
end $$;

-- ---------------------------------------------------------------------------
-- Function privileges. Supabase grants EXECUTE on new functions to anon/authenticated by
-- default, so every function is explicitly locked down here.
-- ---------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function public.quote_cart(jsonb) to anon, authenticated;
grant execute on function public.shipping_cost_cents(text, integer, integer) to anon, authenticated;
grant execute on function public.slugify(text) to anon, authenticated;
grant execute on function public.format_euro(integer) to anon, authenticated;

grant execute on function public.create_order(jsonb) to authenticated;
grant execute on function public.customer_cancel_pending_order(uuid) to authenticated;
grant execute on function public.staff_role() to authenticated;
grant execute on function public.staff_store_id() to authenticated;
grant execute on function public.is_staff() to authenticated;
grant execute on function public.is_manager() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.staff_can_access_store(uuid) to authenticated;
grant execute on function public.staff_set_order_status(uuid, text, text, text, text, text) to authenticated;
grant execute on function public.staff_add_order_note(uuid, text, boolean) to authenticated;
grant execute on function public.staff_set_stock(uuid, uuid, integer, text) to authenticated;
grant execute on function public.admin_import_products(jsonb, boolean) to authenticated;
grant execute on function public.admin_dashboard(timestamptz, timestamptz, uuid) to authenticated;

-- RLS policy helpers must stay callable by anon too (policies evaluate them for every role).
grant execute on function public.is_staff() to anon;
grant execute on function public.is_manager() to anon;
grant execute on function public.is_admin() to anon;
grant execute on function public.staff_can_access_store(uuid) to anon;

-- Trigger functions are invoked by the trigger machinery, not by callers.
-- Service-role only: attach_checkout_session, release_order, expire_stale_orders,
-- mark_order_paid, record_refund, _restock_order.
grant execute on all functions in schema public to service_role;
