-- Test helpers (installed only in the throwaway test database).
create schema if not exists tests;
grant usage on schema tests to anon, authenticated, service_role;

create or replace function tests.fail(msg text) returns void language plpgsql as $$
begin raise exception 'ASSERTION FAILED: %', msg; end $$;

create or replace function tests.eq(actual anyelement, expected anyelement, msg text) returns void language plpgsql as $$
begin
  if actual is distinct from expected then
    raise exception 'ASSERTION FAILED: % (expected %, got %)', msg, expected, actual;
  end if;
end $$;

create or replace function tests.ok(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'ASSERTION FAILED: %', msg; end if;
end $$;

-- Executes `sql` and asserts it raises an error whose message matches `pattern` (regex).
create or replace function tests.throws(sql text, pattern text, msg text) returns void language plpgsql as $$
begin
  begin
    execute sql;
  exception when others then
    if sqlerrm ~ pattern then return; end if;
    raise exception 'ASSERTION FAILED: % (expected error ~ "%", got "%")', msg, pattern, sqlerrm;
  end;
  raise exception 'ASSERTION FAILED: % (expected error ~ "%", but no error)', msg, pattern;
end $$;

-- Simulates a Supabase JWT for the next statements. Use together with `set role ...`.
create or replace function tests.login(p_uid uuid, p_role text default 'authenticated') returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', p_role)::text, false);
$$;
create or replace function tests.logout() returns void language sql as $$
  select set_config('request.jwt.claims', '', false);
$$;

create or replace function tests.store(p_code text) returns uuid language sql stable as $$
  select id from public.stores where code = p_code
$$;
create or replace function tests.product(p_sku text) returns uuid language sql stable as $$
  select id from public.products where sku = p_sku
$$;
create or replace function tests.stock(p_code text, p_sku text) returns integer language sql stable as $$
  select quantity from public.inventory where store_id = tests.store(p_code) and product_id = tests.product(p_sku)
$$;

-- Builds a cart payload for quote_cart / create_order.
create or replace function tests.cart(p_store text, p_fulfilment text, p_items jsonb, p_extra jsonb default '{}'::jsonb)
returns jsonb language sql stable as $$
  select jsonb_build_object('store_id', tests.store(p_store), 'fulfilment', p_fulfilment,
    'items', (select jsonb_agg(jsonb_build_object('product_id', tests.product(k), 'quantity', v::int))
              from jsonb_each_text(p_items) as e(k, v))) || p_extra
$$;

grant execute on all functions in schema tests to anon, authenticated, service_role;
-- Test helpers read catalogue ids directly; bypass RLS concerns by running as definer.
alter function tests.store(text) security definer;
alter function tests.product(text) security definer;
alter function tests.stock(text, text) security definer;
alter function tests.cart(text, text, jsonb, jsonb) security definer;

-- Fixture users.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'cliente.a@example.com', '{"full_name":"Cliente A"}'),
  ('00000000-0000-0000-0000-00000000000b', 'cliente.b@example.com', '{"full_name":"Cliente B"}'),
  ('00000000-0000-0000-0000-0000000000c1', 'staff.lu1@example.com', '{}'),
  ('00000000-0000-0000-0000-0000000000d1', 'manager@example.com', '{}'),
  ('00000000-0000-0000-0000-0000000000e1', 'admin@example.com', '{}');
update public.profiles set phone = '+39 333 1234567' where id in
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b');
insert into public.staff_members (user_id, role, store_id) values
  ('00000000-0000-0000-0000-0000000000c1', 'store_staff', (select id from public.stores where code = 'LU1')),
  ('00000000-0000-0000-0000-0000000000d1', 'manager', null),
  ('00000000-0000-0000-0000-0000000000e1', 'admin', null);
