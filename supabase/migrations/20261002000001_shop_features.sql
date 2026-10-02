-- Shop features to match the approved storefront design:
--   * product display attributes: unit size (for the unit price), colour, up to four highlights,
--     variant groups (each variant is its own product with its own SKU, price and stock);
--   * product reviews from verified buyers, with a rating summary kept on products;
--   * CASA & TE Club: opt-in membership and club-only coupons (enforced in quote_cart).
-- Charged amounts are unchanged: quote_cart only gains the club-only coupon check.

-- ---------------------------------------------------------------------------
-- Product attributes
-- ---------------------------------------------------------------------------
alter table public.products
  add column unit_quantity numeric(10,3) check (unit_quantity is null or unit_quantity > 0),
  add column unit text check (unit is null or unit in ('ml', 'l', 'g', 'kg', 'pz', 'm')),
  add column color text check (color is null or length(trim(color)) between 1 and 40),
  add column highlights jsonb not null default '[]'::jsonb,
  add column variant_group text check (variant_group is null or variant_group ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  add column variant_title text check (variant_title is null or length(trim(variant_title)) between 1 and 40),
  add column variant_label text check (variant_label is null or length(trim(variant_label)) between 1 and 40),
  add column rating_avg numeric(2,1),
  add column rating_count integer not null default 0;

alter table public.products
  add constraint products_unit_pair check ((unit is null) = (unit_quantity is null)),
  add constraint products_highlights_shape check (
    jsonb_typeof(highlights) = 'array' and jsonb_array_length(highlights) <= 4),
  add constraint products_variant_label check (variant_group is null or variant_label is not null);

create index products_variant_group_idx on public.products (variant_group) where variant_group is not null and active;
create index products_brand_idx on public.products (brand) where active and brand is not null;
create index products_color_idx on public.products (color) where active and color is not null;

-- Highlights: [{ "icon": "<one of the shop icons>", "label": "max 40 chars" }].
create or replace function public.products_check_highlights()
returns trigger language plpgsql set search_path = '' as $$
declare h jsonb;
begin
  for h in select * from jsonb_array_elements(new.highlights) loop
    if jsonb_typeof(h) <> 'object'
       or coalesce(h ->> 'icon', '') not in ('leaf', 'home', 'diamond', 'drop', 'sun', 'shield', 'star', 'recycle', 'hand', 'box', 'heart', 'sparkle')
       or length(trim(coalesce(h ->> 'label', ''))) not between 1 and 40 then
      raise exception 'invalid_highlights' using errcode = 'P0001';
    end if;
  end loop;
  -- The rating summary is maintained from product_reviews only.
  if tg_op = 'UPDATE' and coalesce(current_setting('casa.rating_sync', true), '') <> 'on' then
    new.rating_avg := old.rating_avg;
    new.rating_count := old.rating_count;
  elsif tg_op = 'INSERT' then
    new.rating_avg := null;
    new.rating_count := 0;
  end if;
  return new;
end $$;
create trigger products_check_highlights before insert or update on public.products
  for each row execute function public.products_check_highlights();

-- ---------------------------------------------------------------------------
-- Reviews (verified buyers only, one per customer and product)
-- ---------------------------------------------------------------------------
create table public.product_reviews (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  author_name text not null check (length(trim(author_name)) between 1 and 60),
  rating smallint not null check (rating between 1 and 5),
  comment text check (comment is null or length(comment) <= 2000),
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, user_id)
);
create index product_reviews_product_idx on public.product_reviews (product_id, created_at desc) where not hidden;
create trigger product_reviews_touch before update on public.product_reviews for each row execute function public.touch_updated_at();

alter table public.product_reviews enable row level security;
create policy product_reviews_read on public.product_reviews for select using (not hidden or public.is_staff());
create policy product_reviews_moderate on public.product_reviews for update to authenticated
  using (public.is_manager()) with check (public.is_manager());
create policy product_reviews_delete on public.product_reviews for delete to authenticated using (public.is_manager());

-- Explicit grants (no defaults on newer projects). Reviewer ids are never exposed to the API;
-- customers write through submit_review().
revoke all on public.product_reviews from anon, authenticated;
grant select (id, product_id, author_name, rating, comment, created_at) on public.product_reviews to anon;
grant select (id, product_id, author_name, rating, comment, created_at, hidden) on public.product_reviews to authenticated;
grant update (hidden) on public.product_reviews to authenticated;
grant delete on public.product_reviews to authenticated;
grant all on public.product_reviews to service_role;

create or replace function public.sync_product_rating()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_product uuid := coalesce(new.product_id, old.product_id);
begin
  perform set_config('casa.rating_sync', 'on', true);
  update public.products p set
    rating_count = s.n,
    rating_avg = case when s.n > 0 then round(s.avg, 1) end
  from (select count(*)::integer as n, avg(rating)::numeric as avg
        from public.product_reviews where product_id = v_product and not hidden) s
  where p.id = v_product;
  perform set_config('casa.rating_sync', 'off', true);
  return null;
end $$;
create trigger product_reviews_sync after insert or update or delete on public.product_reviews
  for each row execute function public.sync_product_rating();

-- Has the signed-in customer bought (and paid for) this product?
create or replace function public.can_review_product(p_product_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_review public.product_reviews;
  v_bought boolean;
begin
  if v_uid is null then return jsonb_build_object('eligible', false, 'review', null); end if;
  select exists (
    select 1 from public.orders o join public.order_items oi on oi.order_id = o.id
    where o.user_id = v_uid and oi.product_id = p_product_id
      and o.payment_status in ('paid', 'partially_refunded')
      and o.status in ('paid', 'picking', 'ready', 'shipped', 'completed')
  ) into v_bought;
  select * into v_review from public.product_reviews where product_id = p_product_id and user_id = v_uid;
  return jsonb_build_object('eligible', v_bought,
    'review', case when v_review.id is null then null
      else jsonb_build_object('rating', v_review.rating, 'comment', v_review.comment, 'hidden', v_review.hidden) end);
end $$;

create or replace function public.submit_review(p_product_id uuid, p_rating integer, p_comment text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_name text;
  v_comment text := nullif(trim(coalesce(p_comment, '')), '');
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = 'P0001'; end if;
  if p_rating is null or p_rating not between 1 and 5 then raise exception 'invalid_rating' using errcode = 'P0001'; end if;
  if v_comment is not null and length(v_comment) > 2000 then raise exception 'review_too_long' using errcode = 'P0001'; end if;
  if not coalesce((public.can_review_product(p_product_id) ->> 'eligible')::boolean, false) then
    raise exception 'review_not_allowed' using errcode = 'P0001';
  end if;
  -- Public name: first name plus initial of the last name ("Maria R."), never the full name or email.
  select case
      when coalesce(trim(full_name), '') = '' then 'Cliente'
      when position(' ' in trim(full_name)) = 0 then initcap(trim(full_name))
      else initcap(split_part(trim(full_name), ' ', 1)) || ' ' ||
           upper(left(reverse(split_part(reverse(trim(full_name)), ' ', 1)), 1)) || '.'
    end into v_name
  from public.profiles where id = v_uid;
  insert into public.product_reviews (product_id, user_id, author_name, rating, comment)
  values (p_product_id, v_uid, left(coalesce(v_name, 'Cliente'), 60), p_rating, v_comment)
  on conflict (product_id, user_id) do update
    set rating = excluded.rating, comment = excluded.comment, author_name = excluded.author_name;
  return public.can_review_product(p_product_id);
end $$;

-- ---------------------------------------------------------------------------
-- CASA & TE Club
-- ---------------------------------------------------------------------------
alter table public.profiles add column club_member_since timestamptz;
alter table public.coupons add column club_only boolean not null default false;

create or replace function public.is_club_member()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = auth.uid() and club_member_since is not null);
$$;

create or replace function public.set_club_membership(p_join boolean)
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare v_since timestamptz;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = 'P0001'; end if;
  update public.profiles
    set club_member_since = case when p_join then coalesce(club_member_since, now()) end
    where id = auth.uid()
    returning club_member_since into v_since;
  return v_since;
end $$;

-- Club-only offers currently valid, for members.
create or replace function public.club_offers()
returns table (code text, description text, kind text, value integer, min_subtotal_cents integer, ends_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select c.code, c.description, c.kind, c.value, c.min_subtotal_cents, c.ends_at
  from public.coupons c
  where public.is_club_member() and c.club_only and c.active
    and (c.starts_at is null or c.starts_at <= now()) and (c.ends_at is null or c.ends_at > now())
    and (c.max_redemptions is null or c.redemptions < c.max_redemptions)
  order by c.ends_at nulls last, c.code;
$$;

-- ---------------------------------------------------------------------------
-- quote_cart: unchanged except for the club-only coupon check
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
             sum(least(greatest(coalesce((e ->> 'quantity')::bigint, 0), -1), 1000))::integer as quantity
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
-- Function privileges (Supabase grants EXECUTE to anon/authenticated by default)
-- ---------------------------------------------------------------------------
revoke execute on function public.products_check_highlights() from public, anon, authenticated;
revoke execute on function public.sync_product_rating() from public, anon, authenticated;
revoke execute on function public.can_review_product(uuid) from public, anon;
revoke execute on function public.submit_review(uuid, integer, text) from public, anon;
revoke execute on function public.is_club_member() from public, anon;
revoke execute on function public.set_club_membership(boolean) from public, anon;
revoke execute on function public.club_offers() from public, anon;
grant execute on function public.can_review_product(uuid) to authenticated;
grant execute on function public.submit_review(uuid, integer, text) to authenticated;
grant execute on function public.is_club_member() to authenticated;
grant execute on function public.set_club_membership(boolean) to authenticated;
grant execute on function public.club_offers() to authenticated;
grant execute on function public.quote_cart(jsonb) to anon, authenticated;
grant execute on function public.products_check_highlights(), public.sync_product_rating(), public.can_review_product(uuid),
  public.submit_review(uuid, integer, text), public.is_club_member(), public.set_club_membership(boolean),
  public.club_offers() to service_role;
