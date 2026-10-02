-- Back-office overview: daily series, status counts, top products, store restriction.
begin;

select tests.login('00000000-0000-0000-0000-00000000000a');
set role authenticated;
select public.create_order(tests.cart('LU1', 'store', '{"padella-28": 2}'));
reset role;
set role service_role;
select public.mark_order_paid(id, null, 'pi_overview', total_cents) from public.orders where status = 'pending_payment';
reset role;

select tests.login('00000000-0000-0000-0000-0000000000d1');
set role authenticated;
do $$
declare d jsonb; v_today date := (now() at time zone 'Europe/Rome')::date; v_day jsonb;
begin
  d := public.admin_overview(v_today - 6, v_today);
  perform tests.eq((d ->> 'prev_from')::date, v_today - 13, 'previous period has the same length');
  perform tests.eq(jsonb_array_length(d -> 'series'), 14, 'one entry per day across both periods');
  select x into v_day from jsonb_array_elements(d -> 'series') x where (x ->> 'day')::date = v_today;
  perform tests.eq((v_day ->> 'orders')::int, 1, 'today counts the paid order');
  perform tests.ok((v_day ->> 'revenue_cents')::int > 0, 'today has revenue');
  perform tests.eq((v_day ->> 'customers')::int, 1, 'one distinct customer today');
  perform tests.ok((v_day ->> 'new_customers') is not null, 'managers see sign-ups');
  perform tests.eq((d -> 'status' ->> 'paid')::int, 1, 'status counts for the period');
  perform tests.eq((d -> 'open' ->> 'paid')::int, 1, 'open orders waiting for preparation');
  perform tests.eq(d -> 'top_products' -> 0 ->> 'sku', 'padella-28', 'best seller');
  perform tests.eq((d -> 'top_products' -> 0 ->> 'quantity')::int, 2, 'pieces sold');
  perform tests.throws($q$select public.admin_overview(current_date, current_date - 1)$q$, 'invalid_range', 'reversed range refused');
  perform tests.throws($q$select public.admin_overview(current_date - 400, current_date)$q$, 'invalid_range', 'range longer than a year refused');
end $$;
reset role;

-- Store staff only see their own store, and no customer sign-ups.
update public.staff_members set store_id = tests.store('AR1') where role = 'store_staff';
select tests.login('00000000-0000-0000-0000-0000000000c1');
set role authenticated;
do $$
declare d jsonb; v_today date := (now() at time zone 'Europe/Rome')::date;
begin
  d := public.admin_overview(v_today - 6, v_today, tests.store('LU1'));
  perform tests.eq((select sum((x ->> 'orders')::int) from jsonb_array_elements(d -> 'series') x)::int, 0, 'store staff restricted to own store');
  perform tests.ok((d -> 'series' -> 0 ->> 'new_customers') is null, 'store staff do not see sign-ups');
end $$;
reset role;

-- Customers cannot call it; anonymous callers have no privilege at all.
select tests.login('00000000-0000-0000-0000-00000000000a');
set role authenticated;
do $$ begin
  perform tests.throws($q$select public.admin_overview(current_date - 6, current_date)$q$, 'forbidden', 'customers refused');
end $$;
reset role;
do $$ begin
  perform tests.ok(not has_function_privilege('anon', 'public.admin_overview(date, date, uuid)', 'execute'), 'anon cannot execute');
end $$;

rollback;
