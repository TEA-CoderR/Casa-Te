-- Owner's choices of 14/11/2026:
-- * minimum order €10 on the goods (app_settings.min_order_cents, editable by managers);
-- * store pickup with a time slot chosen by the customer: one-hour slots inside the store's opening hours, from
--   2 hours after now (stores.pickup_lead_minutes) over today and the next two days, minus closures;
-- * pay in store (store pickup only): the order is received at once (status 'paid' = received) with payment_status
--   'unpaid'; completing it at the till records the payment. Held like the other pickup orders (14 days).
-- * the ERP sync fills an empty brand of existing products;
-- * a coupon's per-customer limit also counts pay-in-store orders (quote_cart, copy of 20261029155053 with that change).
-- create_order, staff_set_order_status, quote_cart and erp_apply_batch are copies of their latest versions with only these changes.

alter table public.app_settings add column min_order_cents integer not null default 1000
  check (min_order_cents between 0 and 100000);
grant update (min_order_cents) on public.app_settings to authenticated;

alter table public.stores add column pickup_lead_minutes integer not null default 120
  check (pickup_lead_minutes between 0 and 1440);

-- Opening hours per weekday (ISO 1 = Monday … 7 = Sunday); two rows for a lunch break.
create table public.store_opening_hours (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  weekday smallint not null check (weekday between 1 and 7),
  opens time not null,
  closes time not null,
  check (opens < closes)
);
create index store_opening_hours_store on public.store_opening_hours (store_id, weekday);
alter table public.store_opening_hours enable row level security;
create policy store_opening_hours_read on public.store_opening_hours for select to anon, authenticated using (true);
create policy store_opening_hours_write on public.store_opening_hours for all to authenticated
  using (public.is_manager()) with check (public.is_manager());
revoke all on public.store_opening_hours from anon, authenticated;
grant select on public.store_opening_hours to anon, authenticated;
grant insert, update, delete on public.store_opening_hours to authenticated;
grant all on public.store_opening_hours to service_role;

-- Days a store is closed (holidays): no pickup slots.
create table public.store_closures (
  store_id uuid not null references public.stores (id) on delete cascade,
  day date not null,
  note text check (note is null or length(note) <= 200),
  primary key (store_id, day)
);
alter table public.store_closures enable row level security;
create policy store_closures_read on public.store_closures for select to anon, authenticated using (true);
create policy store_closures_write on public.store_closures for all to authenticated
  using (public.is_manager()) with check (public.is_manager());
revoke all on public.store_closures from anon, authenticated;
grant select on public.store_closures to anon, authenticated;
grant insert, update, delete on public.store_closures to authenticated;
grant all on public.store_closures to service_role;

-- Stores whose opening hours read "Tutti i giorni 8:30–20:00" get those hours every day (the others are set in the admin).
insert into public.store_opening_hours (store_id, weekday, opens, closes)
select s.id, d, make_time(m[1]::int, m[2]::int, 0), make_time(m[3]::int, m[4]::int, 0)
from public.stores s
cross join lateral regexp_match(s.opening_hours, '^\s*Tutti i giorni\s+(\d{1,2})[:.](\d{2})\s*[–-]\s*(\d{1,2})[:.](\d{2})\s*$') m
cross join generate_series(1, 7) d
where m is not null and make_time(m[1]::int, m[2]::int, 0) < make_time(m[3]::int, m[4]::int, 0);

alter table public.orders
  add column payment_method text not null default 'card' check (payment_method in ('card', 'store')),
  add column pickup_slot_start timestamptz,
  add column pickup_slot_end timestamptz,
  add constraint orders_slot_store check (pickup_slot_start is null or (fulfilment = 'store' and pickup_slot_end > pickup_slot_start)),
  add constraint orders_pay_store check (payment_method = 'card' or fulfilment = 'store');
create index orders_pickup_slot on public.orders (store_id, pickup_slot_start) where pickup_slot_start is not null;

-- The pickup slots offered now: whole hours inside the opening hours (Europe/Rome), starting at least
-- pickup_lead_minutes from now, over today and the next p_days - 1 days, closures excluded.
create or replace function public.pickup_slots(p_store_id uuid, p_days integer default 3)
returns table (starts_at timestamptz, ends_at timestamptz)
language sql stable security definer set search_path = '' as $$
  with st as (
    select s.id, s.pickup_lead_minutes from public.stores s
    where s.id = p_store_id and s.active and s.pickup_enabled
  ), days as (
    select (now() at time zone 'Europe/Rome')::date + g as day
    from generate_series(0, least(greatest(coalesce(p_days, 3), 1), 14) - 1) g
  ), slots as (
    select ((d.day + make_interval(hours => x)) at time zone 'Europe/Rome') as starts_at,
           ((d.day + make_interval(hours => x + 1)) at time zone 'Europe/Rome') as ends_at,
           st.pickup_lead_minutes
    from st
    join days d on true
    join public.store_opening_hours oh on oh.store_id = st.id and oh.weekday = extract(isodow from d.day)
    cross join lateral generate_series(ceil(extract(epoch from oh.opens) / 3600)::int,
                                       floor(extract(epoch from oh.closes) / 3600)::int - 1) x
    where not exists (select 1 from public.store_closures c where c.store_id = st.id and c.day = d.day)
  )
  select distinct s.starts_at, s.ends_at from slots s
  where s.starts_at >= now() + make_interval(mins => s.pickup_lead_minutes)
  order by 1;
$$;
revoke all on function public.pickup_slots(uuid, integer) from public, anon, authenticated;
grant execute on function public.pickup_slots(uuid, integer) to anon, authenticated, service_role;

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
  v_pay text := coalesce(nullif(p ->> 'payment_method', ''), 'card');
  v_slot_start timestamptz;
  v_slot_end timestamptz;
  v_min integer := coalesce((select min_order_cents from public.app_settings), 0);
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
  -- Minimum order on the goods (after member prices and coupon, before shipping).
  if (v_q ->> 'subtotal_cents')::integer - (v_q ->> 'discount_cents')::integer < v_min then
    raise exception 'below_minimum_order' using errcode = 'P0001';
  end if;
  -- Pay in store: only for store pickup.
  if v_pay not in ('card', 'store') or (v_pay = 'store' and v_fulfilment <> 'store') then
    raise exception 'invalid_payment_method' using errcode = 'P0001';
  end if;
  -- Pickup slot (store pickup): one of the slots offered right now. Older apps send none.
  if nullif(p ->> 'pickup_slot_start', '') is not null then
    if v_fulfilment <> 'store' then raise exception 'invalid_pickup_slot' using errcode = 'P0001'; end if;
    begin
      select s.starts_at, s.ends_at into v_slot_start, v_slot_end
      from public.pickup_slots((v_q ->> 'store_id')::uuid) s
      where s.starts_at = (p ->> 'pickup_slot_start')::timestamptz;
    exception when invalid_datetime_format or datetime_field_overflow then v_slot_start := null;
    end;
    if v_slot_start is null then raise exception 'invalid_pickup_slot' using errcode = 'P0001'; end if;
  end if;

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
    shipping_address, pickup_point_id, pickup_point_snapshot, invoice_requested, invoice_details, notes,
    payment_method, pickup_slot_start, pickup_slot_end, status)
  values (
    v_uid, (v_q ->> 'store_id')::uuid, v_fulfilment,
    (v_q ->> 'subtotal_cents')::integer, (v_q ->> 'discount_cents')::integer,
    (v_q ->> 'shipping_cents')::integer, (v_q ->> 'total_cents')::integer,
    (v_q ->> 'total_weight_g')::integer,
    coalesce((v_q -> 'shipping' -> v_fulfilment ->> 'provisional')::boolean, false),
    v_coupon_id, v_q -> 'coupon' ->> 'code', v_email, trim(v_name), trim(v_phone),
    v_addr, v_pp.id, v_pp_snapshot, v_invoice is not null, v_invoice,
    nullif(left(trim(coalesce(p ->> 'notes', '')), 500), ''),
    v_pay, v_slot_start, v_slot_end,
    -- Paid in store: received now (status 'paid' = received); payment_status stays 'unpaid' until the till.
    case when v_pay = 'store' then 'paid' else 'pending_payment' end)
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

  if v_pay = 'store' then
    if v_coupon_id is not null then update public.coupons set redemptions = redemptions + 1 where id = v_coupon_id; end if;
    insert into public.order_events (order_id, status, kind, note, actor_id)
    values (v_order.id, 'paid', 'status', 'Ordine ricevuto · pagamento in negozio', v_uid);
  else
    insert into public.order_events (order_id, status, kind, note, actor_id)
    values (v_order.id, 'pending_payment', 'status', 'Ordine creato, in attesa di pagamento', v_uid);
  end if;

  return jsonb_build_object(
    'id', v_order.id, 'order_number', v_order.order_number, 'total_cents', v_order.total_cents,
    'customer_email', v_order.customer_email, 'expires_at', v_order.expires_at,
    'status', v_order.status, 'payment_method', v_order.payment_method);
end $$;
revoke all on function public.create_order(jsonb) from public, anon, authenticated;
grant execute on function public.create_order(jsonb) to authenticated, service_role;

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

  -- Pay in store: handing the order over means the customer paid at the till.
  if p_status = 'completed' and v_order.payment_method = 'store' and v_order.payment_status = 'unpaid' then
    update public.orders set payment_status = 'paid', paid_at = now() where id = p_order_id;
    insert into public.order_events (order_id, kind, note, actor_id)
    values (p_order_id, 'payment', 'Pagato in negozio: ' || public.format_euro(v_order.total_cents), auth.uid());
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
revoke all on function public.staff_set_order_status(uuid, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.staff_set_order_status(uuid, text, text, text, text, text) to authenticated, service_role;

-- The customer can cancel a pay-in-store order until the store starts preparing it (and, as before, an unpaid card order).
create or replace function public.customer_cancel_order(p_order_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_order public.orders;
begin
  select * into v_order from public.orders where id = p_order_id and user_id = auth.uid() for update;
  if not found then raise exception 'order_not_found' using errcode = 'P0001'; end if;
  if v_order.status = 'pending_payment' then
    return public.release_order(p_order_id, 'Annullato dal cliente prima del pagamento');
  end if;
  if v_order.payment_method <> 'store' or v_order.payment_status <> 'unpaid' or v_order.status <> 'paid' then
    raise exception 'order_not_cancellable' using errcode = 'P0001';
  end if;
  perform public._restock_order(v_order);
  update public.orders set status = 'cancelled', cancelled_at = now() where id = p_order_id;
  insert into public.order_events (order_id, status, kind, note, actor_id)
  values (p_order_id, 'cancelled', 'status', 'Annullato dal cliente', auth.uid());
  return true;
end $$;
revoke all on function public.customer_cancel_order(uuid) from public, anon, authenticated;
grant execute on function public.customer_cancel_order(uuid) to authenticated, service_role;

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
        weight_g = coalesce(nullif((v_row ->> 'weight_g')::integer, 0), weight_g),
        -- The ERP brand fills an empty one (a brand edited in the admin is kept).
        brand = coalesce(brand, nullif(trim(v_row ->> 'brand'), ''))
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
revoke all on function public.erp_apply_batch(jsonb) from public, anon, authenticated;
grant execute on function public.erp_apply_batch(jsonb) to service_role;

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
    elsif v_coupon.user_id is not null and v_coupon.user_id is distinct from auth.uid() then
      v_coupon_error := 'coupon_not_found';
    elsif v_subtotal < v_coupon.min_subtotal_cents then
      v_coupon_error := 'coupon_min_subtotal';
    else
      if v_coupon.per_customer_limit is not null and auth.uid() is not null then
        select count(*) into v_used from public.orders o
        where o.coupon_id = v_coupon.id and o.user_id = auth.uid()
          and (o.payment_status <> 'unpaid' or (o.status = 'pending_payment' and o.expires_at > now())
               or (o.payment_method = 'store' and o.status <> 'cancelled'));
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
revoke all on function public.quote_cart(jsonb) from public, anon, authenticated;
grant execute on function public.quote_cart(jsonb) to anon, authenticated, service_role;
