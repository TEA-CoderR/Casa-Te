-- Safety stock, part 2: the customer-facing functions read inventory.sellable (see 20261118110000_safety_stock.sql).
-- Copies of their latest versions with only that change.

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
       and sellable >= (v_line ->> 'quantity')::integer;  -- the safety stock stays in the store
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
             coalesce(i.sellable, 0) as available,
             (select pi.path from public.product_images pi
               where pi.product_id = pr.id order by pi.sort, pi.created_at limit 1) as image_path,
             case
               when pr.id is null or not pr.active then 'unavailable'
               when r.quantity < 1 or r.quantity > pr.max_per_order then 'invalid_quantity'
               when coalesce(i.sellable, 0) < r.quantity then 'insufficient_stock'
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

create or replace function public.search_products(
  p_query text, p_store uuid default null, p_category_ids uuid[] default null,
  p_on_sale boolean default false, p_limit integer default 40, p_offset integer default 0)
returns table (product_id uuid, total bigint, fuzzy boolean)
language sql
stable
security invoker
set search_path = ''
as $$
  with typed as (
    select trim(public.search_fold(coalesce(p_query, ''))) as k
  ), q0 as (
    -- The whole text, or each word, replaced by its synonym when the shop listed one.
    select coalesce((select s.expands_to from public.search_synonyms s where s.term = typed.k),
      (select string_agg(coalesce(s.expands_to, w.word), ' ' order by w.ord)
       from regexp_split_to_table(typed.k, '\s+') with ordinality as w(word, ord)
       left join public.search_synonyms s on s.term = w.word
       where w.word <> ''), '') as k
    from typed
  ), q as (
    select public.search_fold(q0.k) as k,
           array_remove(regexp_split_to_array(public.search_fold(q0.k), '\s+'), '') as words
    from q0
  ), scope as (
    select p.id, p.name, p.brand, p.category_rank, p.search_text, p.category_text,
      exists (select 1 from public.inventory i where i.product_id = p.id and i.sellable > 0
              and (p_store is null or i.store_id = p_store)) as in_stock
    from public.products p, q
    where p.active and cardinality(q.words) > 0
      and (p_category_ids is null or p.category_id = any (p_category_ids))
      and (not p_on_sale or p.compare_at_price_cents is not null or p.member_price_cents is not null)
  ), strict as (
    -- Every word (without its final vowel) is in the name, brand, code — or in the category's names.
    select s.id, s.name, s.category_rank, s.in_stock,
      case when public.search_fold(s.name) like q.k || '%' then 0
           when ' ' || public.search_fold(s.name) || ' ' like '% ' || q.words[1] || ' %' then 1
           when ' ' || public.search_fold(s.name) like '% ' || public.search_stem(q.words[1]) || '%'
             or public.search_fold(coalesce(s.brand, '')) like q.words[1] || '%' then 2
           when s.search_text like '%' || public.search_stem(q.words[1]) || '%' then 3
           else 4 end as rank
    from scope s, q
    where not exists (select 1 from unnest(q.words) w
      where s.search_text not like '%' || public.search_stem(w) || '%'
        and s.category_text not like '%' || public.search_stem(w) || '%')
  ), close as (
    -- Few or no matches: products where each word is there or spelled almost like one of theirs.
    select s.id, s.name, s.category_rank, s.in_stock,
      (select avg(extensions.word_similarity(w, s.search_text)) from unnest(q.words) w) as likeness
    from scope s, q
    where (select count(*) from strict) < 6
      and not exists (select 1 from strict t where t.id = s.id)
      and not exists (select 1 from unnest(q.words) w
        where s.search_text not like '%' || public.search_stem(w) || '%'
          and (length(w) < 4 or extensions.word_similarity(w, s.search_text) < 0.45))
  ), hits as (
    select id, name, category_rank, in_stock, rank::numeric as rank, false as fuzzy from strict
    union all
    select id, name, category_rank, in_stock, 1 - likeness, true from close
  )
  select id, count(*) over (), fuzzy
  from hits
  order by fuzzy, in_stock desc, rank, category_rank nulls last, name, id
  limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0);
$$;
revoke all on function public.search_products(text, uuid, uuid[], boolean, integer, integer) from public;
grant execute on function public.search_products(text, uuid, uuid[], boolean, integer, integer) to anon, authenticated, service_role;

create or replace function public.match_label_text(p_text text, p_store uuid default null, p_limit integer default 6)
returns table (product_id uuid, score numeric, exact boolean)
language sql
stable
security invoker
set search_path = ''
as $$
  with t as (
    select public.label_words(left(coalesce(p_text, ''), 4000)) as txt,
           -- Barcode digits are often read in groups ("8 001090 123456"): joined again before looking for codes.
           regexp_replace(regexp_replace(left(coalesce(p_text, ''), 4000), '([0-9])[ .-]+([0-9])', '\1\2', 'g'),
             '([0-9])[ .-]+([0-9])', '\1\2', 'g') as digits
  ), codes as (
    select distinct ltrim(m[1], '0') as code from t, regexp_matches(t.digits, '(?:^|[^0-9])([0-9]{8}|[0-9]{12,14})(?![0-9])', 'g') m
  ), words as (
    select distinct w from t, regexp_split_to_table(trim(t.txt), ' ') w where length(w) >= 4 and w !~ '^[0-9]+$'
    limit 80
  ), scope as (
    select p.id, p.name, p.brand, p.barcode, public.label_words(p.name) as nw,
      exists (select 1 from public.inventory i where i.product_id = p.id and i.sellable > 0
              and (p_store is null or i.store_id = p_store)) as in_stock
    from public.products p
    where p.active
      and (exists (select 1 from words where p.search_text like '%' || words.w || '%')
        or (p.barcode is not null and ltrim(p.barcode, '0') in (select code from codes)))
  ), scored as (
    select s.id, s.name, s.in_stock,
      s.barcode is not null and ltrim(s.barcode, '0') in (select code from codes) as exact,
      -- The name's words (letters only, 3+): how many are printed on the pack, singular or plural.
      (select count(*) from regexp_split_to_table(trim(s.nw), ' ') w where w ~ '^[a-z]{3,}$') as total,
      (select count(*) from regexp_split_to_table(trim(s.nw), ' ') w, t
        where w ~ '^[a-z]{3,}$' and (t.txt like '% ' || public.search_stem(w) || '%'
          -- Names from the ERP sometimes glue words ("limoneebasilico"): found in the pack's text without spaces.
          or (length(w) >= 9 and replace(t.txt, ' ', '') like '%' || w || '%'))) as matched,
      -- The size or quantity ("930", "750") printed on the pack tells variants apart.
      (select count(*) from regexp_split_to_table(trim(s.nw), ' ') w, t
        where w ~ '^[0-9]{2,}$' and t.txt like '% ' || w || ' %') as sizes,
      s.brand is not null and length(s.brand) >= 3 and (select t.txt from t) like '% ' || trim(public.label_words(s.brand)) || ' %' as brand_hit
    from scope s
  )
  select id,
    round(case when exact then 10 else
      matched::numeric / greatest(total, 1) + 0.15 * least(sizes, 2) + case when brand_hit then 0.2 else 0 end + 0.02 * matched end, 3),
    exact
  from scored
  where exact or matched >= 2 or (matched = 1 and total = 1)
  order by 2 desc, in_stock desc, name, id
  limit least(greatest(p_limit, 1), 20);
$$;
revoke all on function public.match_label_text(text, uuid, integer) from public;
grant execute on function public.match_label_text(text, uuid, integer) to anon, authenticated, service_role;

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
      and exists (select 1 from public.inventory v where v.product_id = p.id and v.sellable > 0
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
