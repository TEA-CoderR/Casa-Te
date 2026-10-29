-- Returns and after-sales (resi e assistenza).
-- The customer asks from the order (items, reason, photos, refund or same-product exchange, card or voucher),
-- a manager approves, the store receives the goods, then a manager refunds (Stripe, admin-refund function)
-- or issues a voucher, or the store hands over the replacement. Every step is an order event (emails).

alter table public.order_events drop constraint if exists order_events_kind_check;
alter table public.order_events add constraint order_events_kind_check
  check (kind in ('status', 'note', 'payment', 'refund', 'system', 'return'));

-- Vouchers are single-use coupons bound to one customer.
alter table public.coupons add column if not exists user_id uuid references auth.users(id) on delete cascade;

create sequence if not exists public.return_number_seq;

create table if not exists public.return_requests (
  id uuid primary key default gen_random_uuid(),
  return_number text not null unique default ('RESO-' || lpad(nextval('public.return_number_seq')::text, 5, '0')),
  order_id uuid not null references public.orders(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  store_id uuid not null references public.stores(id),
  status text not null default 'requested'
    check (status in ('requested', 'approved', 'rejected', 'received', 'refunded', 'exchanged', 'cancelled')),
  reason text not null check (reason in ('changed_mind', 'damaged', 'wrong_item', 'missing', 'other')),
  note text check (note is null or length(note) <= 1000),
  resolution text not null check (resolution in ('refund', 'exchange')),
  refund_method text check (refund_method in ('card', 'voucher')),
  photo_paths text[] not null default '{}',
  amount_cents integer not null check (amount_cents >= 0),
  refund_cents integer,
  voucher_code text,
  decision_note text,
  decided_by uuid references auth.users(id) on delete set null, decided_at timestamptz,
  received_by uuid references auth.users(id) on delete set null, received_at timestamptz,
  completed_by uuid references auth.users(id) on delete set null, completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((resolution = 'refund') = (refund_method is not null))
);
create index if not exists return_requests_order_idx on public.return_requests (order_id);
create index if not exists return_requests_status_idx on public.return_requests (status, created_at desc);
create index if not exists return_requests_store_idx on public.return_requests (store_id, created_at desc);
create trigger return_requests_touch before update on public.return_requests for each row execute function public.touch_updated_at();

create table if not exists public.return_items (
  return_id uuid not null references public.return_requests(id) on delete cascade,
  order_item_id uuid not null references public.order_items(id) on delete cascade,
  quantity integer not null check (quantity > 0),
  primary key (return_id, order_item_id)
);

alter table public.return_requests enable row level security;
alter table public.return_items enable row level security;
create policy return_requests_read on public.return_requests for select to authenticated
  using (user_id = auth.uid() or public.staff_can_access_store(store_id));
create policy return_items_read on public.return_items for select to authenticated
  using (exists (select 1 from public.return_requests r where r.id = return_id
                 and (r.user_id = auth.uid() or public.staff_can_access_store(r.store_id))));
-- Clients read through RLS (customers their own, staff their stores); writes only through the functions below.
grant select on public.return_requests, public.return_items to anon, authenticated;
grant select, insert, update, delete on public.return_requests, public.return_items to service_role;
revoke insert, update, delete on public.return_requests, public.return_items from anon, authenticated;

-- Private bucket for the customers' photos: they upload into their own folder; they and staff read.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('return-photos', 'return-photos', false, 6291456, array['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do nothing;
create policy "return photos own upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'return-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "return photos read" on storage.objects for select to authenticated
  using (bucket_id = 'return-photos' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_staff()));

-- When the order became the customer's (collected or shipped): the 14-day withdrawal period starts here.
create or replace function public.order_handed_over_at(p_order uuid)
returns timestamptz language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select o.completed_at from public.orders o where o.id = p_order),
    (select max(e.created_at) from public.order_events e where e.order_id = p_order and e.kind = 'status' and e.status = 'shipped'),
    (select o.updated_at from public.orders o where o.id = p_order));
$$;

-- Units of an order line still returnable (bought minus those in open or completed returns).
create or replace function public.returnable_quantity(p_order_item uuid)
returns integer language sql stable security definer set search_path = '' as $$
  select greatest(0, oi.quantity - coalesce((select sum(ri.quantity) from public.return_items ri
      join public.return_requests r on r.id = ri.return_id
      where ri.order_item_id = oi.id and r.status not in ('rejected', 'cancelled')), 0))::integer
  from public.order_items oi where oi.id = p_order_item;
$$;

create or replace function public.return_event(p_return public.return_requests, p_note text, p_actor uuid)
returns void language sql security definer set search_path = '' as $$
  insert into public.order_events (order_id, kind, note, visible_to_customer, actor_id)
  values (p_return.order_id, 'return', p_note, true, p_actor);
$$;

create or replace function public.create_return_request(p_order uuid, p_items jsonb, p_reason text, p_note text,
  p_resolution text, p_refund_method text, p_photos text[] default '{}')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_order public.orders;
  v_ret public.return_requests;
  v_days numeric;
  v_item record;
  v_total numeric := 0;
  v_count integer := 0;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_photos text[] := coalesce(p_photos, '{}');
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = 'P0001'; end if;
  select * into v_order from public.orders where id = p_order and user_id = auth.uid();
  if not found then raise exception 'order_not_found' using errcode = 'P0001'; end if;
  if v_order.status not in ('shipped', 'completed') then raise exception 'return_not_allowed' using errcode = 'P0001'; end if;
  if p_reason not in ('changed_mind', 'damaged', 'wrong_item', 'missing', 'other') then raise exception 'return_reason_invalid' using errcode = 'P0001'; end if;
  if p_resolution not in ('refund', 'exchange') then raise exception 'return_resolution_invalid' using errcode = 'P0001'; end if;
  if p_resolution = 'refund' and coalesce(p_refund_method, '') not in ('card', 'voucher') then raise exception 'return_refund_method_invalid' using errcode = 'P0001'; end if;
  if p_resolution = 'exchange' and p_reason = 'missing' then raise exception 'return_resolution_invalid' using errcode = 'P0001'; end if;

  v_days := extract(epoch from now() - public.order_handed_over_at(v_order.id)) / 86400;
  if p_reason = 'changed_mind' and v_days > 14 then raise exception 'return_window_expired' using errcode = 'P0001'; end if;
  if v_days > 730 then raise exception 'return_window_expired' using errcode = 'P0001'; end if;

  if p_reason in ('damaged', 'wrong_item') and cardinality(v_photos) = 0 then raise exception 'return_photos_required' using errcode = 'P0001'; end if;
  if cardinality(v_photos) > 5 or exists (select 1 from unnest(v_photos) x where x not like auth.uid()::text || '/%' or x like '%..%') then
    raise exception 'return_photos_invalid' using errcode = 'P0001';
  end if;
  if v_note is not null and length(v_note) > 1000 then raise exception 'return_note_too_long' using errcode = 'P0001'; end if;
  if p_reason = 'other' and v_note is null then raise exception 'return_note_required' using errcode = 'P0001'; end if;

  insert into public.return_requests (order_id, user_id, store_id, reason, note, resolution, refund_method, photo_paths, amount_cents)
  values (v_order.id, auth.uid(), v_order.store_id, p_reason, v_note, p_resolution,
    case when p_resolution = 'refund' then p_refund_method end, v_photos, 0)
  returning * into v_ret;

  for v_item in
    select oi.id, oi.unit_price_cents, (x ->> 'quantity')::integer as qty
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) x
    join public.order_items oi on oi.id = (x ->> 'order_item_id')::uuid and oi.order_id = v_order.id
  loop
    if v_item.qty is null or v_item.qty <= 0 or v_item.qty > public.returnable_quantity(v_item.id) then
      raise exception 'return_quantity_invalid' using errcode = 'P0001';
    end if;
    insert into public.return_items (return_id, order_item_id, quantity) values (v_ret.id, v_item.id, v_item.qty);
    v_total := v_total + v_item.unit_price_cents * v_item.qty;
    v_count := v_count + 1;
  end loop;
  if v_count = 0 or v_count <> jsonb_array_length(coalesce(p_items, '[]'::jsonb)) then
    raise exception 'return_items_required' using errcode = 'P0001';
  end if;

  -- Value of the goods after the order discount (shipping is not included).
  update public.return_requests set amount_cents = round(v_total * (1 - v_order.discount_cents::numeric / nullif(v_order.subtotal_cents, 0)))::integer
    where id = v_ret.id returning * into v_ret;
  perform public.return_event(v_ret, 'Richiesta di reso ' || v_ret.return_number || ' ricevuta: ti scriviamo appena il negozio l''ha valutata.', auth.uid());
  return jsonb_build_object('id', v_ret.id, 'return_number', v_ret.return_number, 'amount_cents', v_ret.amount_cents);
exception when invalid_text_representation then
  raise exception 'return_items_required' using errcode = 'P0001';
end $$;

create or replace function public.cancel_return_request(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_ret public.return_requests;
begin
  update public.return_requests set status = 'cancelled'
    where id = p_id and user_id = auth.uid() and status in ('requested', 'approved') returning * into v_ret;
  if not found then raise exception 'return_not_found' using errcode = 'P0001'; end if;
  perform public.return_event(v_ret, 'Hai annullato la richiesta di reso ' || v_ret.return_number || '.', auth.uid());
end $$;

-- Managers approve or reject.
create or replace function public.staff_decide_return(p_id uuid, p_approve boolean, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_ret public.return_requests; v_note text := nullif(trim(coalesce(p_note, '')), '');
begin
  if not public.is_manager() then raise exception 'forbidden' using errcode = 'P0001'; end if;
  if not p_approve and v_note is null then raise exception 'return_reject_reason_required' using errcode = 'P0001'; end if;
  update public.return_requests set status = case when p_approve then 'approved' else 'rejected' end,
      decision_note = v_note, decided_by = auth.uid(), decided_at = now()
    where id = p_id and status = 'requested' returning * into v_ret;
  if not found then raise exception 'return_not_found' using errcode = 'P0001'; end if;
  perform public.return_event(v_ret, case when p_approve
    then 'Reso ' || v_ret.return_number || ' approvato: porta gli articoli in negozio con il codice ' || v_ret.return_number || '.'
    else 'Reso ' || v_ret.return_number || ' non accettato: ' || v_note end, auth.uid());
end $$;

-- The store receives the goods (any staff of that store).
create or replace function public.staff_receive_return(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_ret public.return_requests;
begin
  select * into v_ret from public.return_requests where id = p_id;
  if not found or not public.staff_can_access_store(v_ret.store_id) then raise exception 'return_not_found' using errcode = 'P0001'; end if;
  update public.return_requests set status = 'received', received_by = auth.uid(), received_at = now()
    where id = p_id and status = 'approved' returning * into v_ret;
  if not found then raise exception 'return_wrong_status' using errcode = 'P0001'; end if;
  perform public.return_event(v_ret, 'Abbiamo ricevuto gli articoli del reso ' || v_ret.return_number || '.', auth.uid());
end $$;

-- Same-product exchange handed over in store (any staff of that store).
create or replace function public.staff_complete_exchange(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_ret public.return_requests;
begin
  select * into v_ret from public.return_requests where id = p_id;
  if not found or not public.staff_can_access_store(v_ret.store_id) then raise exception 'return_not_found' using errcode = 'P0001'; end if;
  update public.return_requests set status = 'exchanged', completed_by = auth.uid(), completed_at = now()
    where id = p_id and status = 'received' and resolution = 'exchange' returning * into v_ret;
  if not found then raise exception 'return_wrong_status' using errcode = 'P0001'; end if;
  perform public.return_event(v_ret, 'Cambio del reso ' || v_ret.return_number || ' completato: grazie!', auth.uid());
end $$;

-- Refund as a voucher (managers): a single-use code for this customer, valid 12 months.
create or replace function public.staff_issue_return_voucher(p_id uuid, p_amount_cents integer default null)
returns text language plpgsql security definer set search_path = '' as $$
declare v_ret public.return_requests; v_amount integer; v_code text;
begin
  if not public.is_manager() then raise exception 'forbidden' using errcode = 'P0001'; end if;
  select * into v_ret from public.return_requests where id = p_id for update;
  if not found then raise exception 'return_not_found' using errcode = 'P0001'; end if;
  if v_ret.status <> 'received' or v_ret.resolution <> 'refund' then raise exception 'return_wrong_status' using errcode = 'P0001'; end if;
  if v_ret.user_id is null then raise exception 'return_wrong_status' using errcode = 'P0001'; end if;
  v_amount := coalesce(p_amount_cents, v_ret.amount_cents);
  if v_amount <= 0 or v_amount > v_ret.amount_cents then raise exception 'invalid_refund_amount' using errcode = 'P0001'; end if;
  loop
    v_code := 'BUONO-' || upper(substr(md5(gen_random_uuid()::text), 1, 8));
    exit when not exists (select 1 from public.coupons where code = v_code);
  end loop;
  insert into public.coupons (code, description, kind, value, max_redemptions, per_customer_limit, ends_at, user_id, active)
  values (v_code, 'Buono reso ' || v_ret.return_number, 'fixed', v_amount, 1, 1, now() + interval '12 months', v_ret.user_id, true);
  update public.return_requests set status = 'refunded', refund_method = 'voucher', refund_cents = v_amount, voucher_code = v_code,
      completed_by = auth.uid(), completed_at = now()
    where id = p_id returning * into v_ret;
  perform public.return_event(v_ret, 'Buono di ' || public.format_euro(v_amount) || ' per il reso ' || v_ret.return_number
    || ': usa il codice ' || v_code || ' al checkout entro 12 mesi.', auth.uid());
  return v_code;
end $$;

-- After the Stripe refund (admin-refund function, manager token): closes the return.
create or replace function public.staff_mark_return_refunded(p_id uuid, p_amount_cents integer)
returns void language plpgsql security definer set search_path = '' as $$
declare v_ret public.return_requests;
begin
  if not public.is_manager() then raise exception 'forbidden' using errcode = 'P0001'; end if;
  update public.return_requests set status = 'refunded', refund_method = 'card', refund_cents = p_amount_cents,
      completed_by = auth.uid(), completed_at = now()
    where id = p_id and status = 'received' and resolution = 'refund' returning * into v_ret;
  if not found then raise exception 'return_wrong_status' using errcode = 'P0001'; end if;
end $$;

revoke all on function public.order_handed_over_at(uuid), public.returnable_quantity(uuid),
  public.return_event(public.return_requests, text, uuid) from public, anon, authenticated;
grant execute on function public.returnable_quantity(uuid) to authenticated;
revoke all on function public.create_return_request(uuid, jsonb, text, text, text, text, text[]), public.cancel_return_request(uuid),
  public.staff_decide_return(uuid, boolean, text), public.staff_receive_return(uuid), public.staff_complete_exchange(uuid),
  public.staff_issue_return_voucher(uuid, integer), public.staff_mark_return_refunded(uuid, integer) from public, anon;
grant execute on function public.create_return_request(uuid, jsonb, text, text, text, text, text[]), public.cancel_return_request(uuid),
  public.staff_decide_return(uuid, boolean, text), public.staff_receive_return(uuid), public.staff_complete_exchange(uuid),
  public.staff_issue_return_voucher(uuid, integer), public.staff_mark_return_refunded(uuid, integer) to authenticated;

-- quote_cart: a voucher (coupon with user_id) works only for its customer.
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
