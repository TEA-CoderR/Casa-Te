-- Back office: shop settings, activity log, club administration, staff interface language.
--   * app_settings: one row (low-stock threshold, club on/off and tagline). Everyone reads, managers write.
--   * activity_log: written by triggers only; managers read it.
--   * admin_set_club_membership: managers add or remove a customer from the club.
--   * staff_members.locale + set_my_locale: each staff member picks the console language (it/en/zh).
-- Charged amounts are unchanged (quote_cart is not touched).

-- ---------------------------------------------------------------------------
-- Settings
-- ---------------------------------------------------------------------------
create table public.app_settings (
  id boolean primary key default true check (id),
  low_stock_threshold integer not null default 3 check (low_stock_threshold between 0 and 1000),
  club_enabled boolean not null default true,
  club_tagline text not null default 'Vantaggi esclusivi e offerte dedicate ai nostri clienti.'
    check (char_length(club_tagline) between 1 and 200),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
insert into public.app_settings default values;

create or replace function public.app_settings_touch() returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;
create trigger app_settings_touch before update on public.app_settings for each row execute function public.app_settings_touch();

alter table public.app_settings enable row level security;
create policy app_settings_read on public.app_settings for select to anon, authenticated using (true);
create policy app_settings_manager_update on public.app_settings for update to authenticated
  using (public.is_manager()) with check (public.is_manager());

revoke all on public.app_settings from anon, authenticated;
grant select on public.app_settings to anon, authenticated;
grant update (low_stock_threshold, club_enabled, club_tagline) on public.app_settings to authenticated;
grant all on public.app_settings to service_role;

-- ---------------------------------------------------------------------------
-- Staff interface language
-- ---------------------------------------------------------------------------
alter table public.staff_members add column locale text not null default 'it' check (locale in ('it', 'en', 'zh'));

create or replace function public.set_my_locale(p_locale text)
returns text language plpgsql security definer set search_path = '' as $$
begin
  if p_locale not in ('it', 'en', 'zh') then raise exception 'invalid_locale' using errcode = 'P0001'; end if;
  update public.staff_members set locale = p_locale where user_id = auth.uid();
  if not found then raise exception 'forbidden' using errcode = 'P0001'; end if;
  return p_locale;
end $$;

-- ---------------------------------------------------------------------------
-- Activity log
-- ---------------------------------------------------------------------------
create table public.activity_log (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  actor_id uuid references auth.users(id) on delete set null,
  actor_name text,
  entity text not null,
  entity_id text,
  label text,
  action text not null check (action in ('insert', 'update', 'delete')),
  changes text[] not null default '{}',
  -- Old and new value of each changed field (short values only), e.g. {"price_cents": [499, 549]}.
  details jsonb not null default '{}'::jsonb
);
create index activity_log_created_idx on public.activity_log (created_at desc);
create index activity_log_entity_idx on public.activity_log (entity, created_at desc);
create index activity_log_actor_idx on public.activity_log (actor_id, created_at desc);

alter table public.activity_log enable row level security;
create policy activity_log_manager_read on public.activity_log for select to authenticated using (public.is_manager());
-- Same pattern as every table: the API roles may select, RLS returns rows to managers only.
revoke all on public.activity_log from anon, authenticated;
grant select on public.activity_log to anon, authenticated;
grant all on public.activity_log to service_role;
grant usage, select on sequence public.activity_log_id_seq to service_role;

-- Trigger arguments: 1) comma-separated columns to watch ('' = all), 2) 'staff' to log only staff actions.
-- Changes made by customers themselves are never logged; changes without a user (webhooks, jobs) appear as the system.
create or replace function public.log_activity()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_old jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  v_new jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  v_row jsonb := coalesce(v_new, v_old);
  v_watch text[] := case when tg_nargs > 0 and tg_argv[0] <> '' then string_to_array(tg_argv[0], ',') end;
  v_staff_only boolean := tg_nargs > 1 and tg_argv[1] = 'staff';
  v_ignore text[] := array['updated_at', 'created_at', 'search_text', 'rating_avg', 'rating_count', 'redemptions', 'updated_by'];
  v_actor uuid := auth.uid();
  v_changes text[] := '{}';
  v_details jsonb := '{}'::jsonb;
  v_label text;
  v_name text;
  k text;
begin
  if v_actor is not null and not public.is_staff() then return null; end if;
  if v_staff_only and v_actor is null then return null; end if;

  if tg_op = 'UPDATE' then
    for k in select jsonb_object_keys(v_new) order by 1 loop
      continue when k = any(v_ignore) or (v_watch is not null and not k = any(v_watch));
      if v_new -> k is distinct from v_old -> k then
        v_changes := v_changes || k;
        if coalesce(length((v_old -> k)::text), 0) <= 120 and coalesce(length((v_new -> k)::text), 0) <= 120 then
          v_details := v_details || jsonb_build_object(k, jsonb_build_array(v_old -> k, v_new -> k));
        end if;
      end if;
    end loop;
    if cardinality(v_changes) = 0 then return null; end if;
  end if;

  if tg_table_name = 'inventory' then
    select p.name || ' · ' || s.code into v_label from public.products p, public.stores s
      where p.id = (v_row ->> 'product_id')::uuid and s.id = (v_row ->> 'store_id')::uuid;
  elsif tg_table_name = 'app_settings' then
    v_label := 'app_settings';
  elsif tg_table_name = 'shipping_rates' then
    v_label := coalesce(v_row ->> 'label', v_row ->> 'method');
  elsif tg_table_name = 'product_reviews' then
    select p.name into v_label from public.products p where p.id = (v_row ->> 'product_id')::uuid;
  else
    v_label := coalesce(v_row ->> 'order_number', v_row ->> 'name', v_row ->> 'code', v_row ->> 'display_name',
      v_row ->> 'full_name', v_row ->> 'email', v_row ->> 'sku');
  end if;

  select coalesce(nullif(s.display_name, ''), s.email, u.email) into v_name
    from auth.users u left join public.staff_members s on s.user_id = u.id where u.id = v_actor;
  insert into public.activity_log (actor_id, actor_name, entity, entity_id, label, action, changes, details)
  values (v_actor, v_name, tg_table_name,
    coalesce(v_row ->> 'id', v_row ->> 'user_id', v_row ->> 'product_id'),
    v_label, lower(tg_op), v_changes, v_details);
  return null;
end $$;

create trigger products_activity after insert or update or delete on public.products
  for each row execute function public.log_activity();
create trigger categories_activity after insert or update or delete on public.categories
  for each row execute function public.log_activity();
create trigger coupons_activity after insert or update or delete on public.coupons
  for each row execute function public.log_activity();
create trigger stores_activity after insert or update or delete on public.stores
  for each row execute function public.log_activity();
create trigger shipping_rates_activity after insert or update or delete on public.shipping_rates
  for each row execute function public.log_activity();
create trigger pickup_points_activity after insert or update or delete on public.pickup_points
  for each row execute function public.log_activity();
create trigger app_settings_activity after update on public.app_settings
  for each row execute function public.log_activity();
create trigger staff_members_activity after insert or update or delete on public.staff_members
  for each row execute function public.log_activity('role,store_id,display_name,email,active');
create trigger product_reviews_activity after update or delete on public.product_reviews
  for each row execute function public.log_activity('hidden', 'staff');
create trigger inventory_activity after update of quantity on public.inventory
  for each row execute function public.log_activity('quantity', 'staff');
create trigger orders_activity after update on public.orders
  for each row execute function public.log_activity('status,payment_status,refunded_cents,carrier,tracking_number');
create trigger profiles_club_activity after update of club_member_since on public.profiles
  for each row execute function public.log_activity('club_member_since', 'staff');

-- ---------------------------------------------------------------------------
-- Club
-- ---------------------------------------------------------------------------
-- Customers can join only while the club is enabled; leaving always works.
create or replace function public.set_club_membership(p_join boolean)
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare v_since timestamptz;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = 'P0001'; end if;
  if p_join and not (select club_enabled from public.app_settings) then
    raise exception 'club_disabled' using errcode = 'P0001';
  end if;
  update public.profiles
    set club_member_since = case when p_join then coalesce(club_member_since, now()) end
    where id = auth.uid()
    returning club_member_since into v_since;
  return v_since;
end $$;

create or replace function public.club_offers()
returns table (code text, description text, kind text, value integer, min_subtotal_cents integer, ends_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select c.code, c.description, c.kind, c.value, c.min_subtotal_cents, c.ends_at
  from public.coupons c
  where public.is_club_member() and (select club_enabled from public.app_settings)
    and c.club_only and c.active
    and (c.starts_at is null or c.starts_at <= now()) and (c.ends_at is null or c.ends_at > now())
    and (c.max_redemptions is null or c.redemptions < c.max_redemptions)
  order by c.ends_at nulls last, c.code;
$$;

create or replace function public.admin_set_club_membership(p_user uuid, p_member boolean)
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare v_since timestamptz;
begin
  if not public.is_manager() then raise exception 'forbidden' using errcode = 'P0001'; end if;
  update public.profiles
    set club_member_since = case when p_member then coalesce(club_member_since, now()) end
    where id = p_user
    returning club_member_since into v_since;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  return v_since;
end $$;

-- ---------------------------------------------------------------------------
-- Overview: low-stock threshold now comes from the settings
-- ---------------------------------------------------------------------------
create or replace function public.admin_overview(p_from date, p_to date, p_store_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_store uuid := p_store_id;
  v_manager boolean := public.is_manager();
  v_today date := (now() at time zone 'Europe/Rome')::date;
  v_threshold integer := (select low_stock_threshold from public.app_settings);
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
    'low_stock_threshold', v_threshold,
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
         where i.quantity <= v_threshold and (v_store is null or i.store_id = v_store)
         order by i.quantity, pr.name limit 6) ls), '[]'::jsonb)
  ) into v_result;
  return v_result;
end $$;

-- ---------------------------------------------------------------------------
-- Function privileges (Supabase grants EXECUTE to anon/authenticated by default)
-- ---------------------------------------------------------------------------
revoke execute on function public.app_settings_touch() from public, anon, authenticated;
revoke execute on function public.log_activity() from public, anon, authenticated;
revoke execute on function public.set_my_locale(text) from public, anon;
revoke execute on function public.admin_set_club_membership(uuid, boolean) from public, anon;
revoke execute on function public.set_club_membership(boolean) from public, anon;
revoke execute on function public.club_offers() from public, anon;
revoke execute on function public.admin_overview(date, date, uuid) from public, anon;
grant execute on function public.set_my_locale(text), public.admin_set_club_membership(uuid, boolean),
  public.set_club_membership(boolean), public.club_offers(), public.admin_overview(date, date, uuid) to authenticated;
grant execute on function public.app_settings_touch(), public.log_activity(), public.set_my_locale(text),
  public.admin_set_club_membership(uuid, boolean), public.set_club_membership(boolean), public.club_offers(),
  public.admin_overview(date, date, uuid) to service_role;
