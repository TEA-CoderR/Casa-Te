-- Pickup slots, pay in store, minimum order, brand from the ERP (14/11/2026).
begin;
create temp table t (k text primary key, v text);
grant all on t to authenticated;

-- LU1 open every day 08:30–20:00, closed the day after tomorrow.
insert into public.store_opening_hours (store_id, weekday, opens, closes)
select tests.store('LU1'), d, '08:30', '20:00' from generate_series(1, 7) d;
insert into public.store_closures (store_id, day) values (tests.store('LU1'), (now() at time zone 'Europe/Rome')::date + 2);

do $$
declare n int; first timestamptz; tomorrow date := (now() at time zone 'Europe/Rome')::date + 1;
begin
  -- Tomorrow: whole hours 9–19 (the 8:30 half hour is not a slot), 11 slots of one hour.
  select count(*) into n from public.pickup_slots(tests.store('LU1'))
  where (starts_at at time zone 'Europe/Rome')::date = tomorrow;
  perform tests.eq(n, 11, 'tomorrow has 11 one-hour slots');
  select min(starts_at) into first from public.pickup_slots(tests.store('LU1')) where (starts_at at time zone 'Europe/Rome')::date = tomorrow;
  perform tests.eq(to_char(first at time zone 'Europe/Rome', 'HH24:MI'), '09:00', 'first slot at 9');
  perform tests.ok(not exists (select 1 from public.pickup_slots(tests.store('LU1')) where starts_at < now() + interval '2 hours'),
    'no slot within the 2-hour lead time');
  perform tests.ok(not exists (select 1 from public.pickup_slots(tests.store('LU1'))
    where (starts_at at time zone 'Europe/Rome')::date = tomorrow + 1), 'closure day has no slots');
  perform tests.ok(not exists (select 1 from public.pickup_slots(tests.store('LU1'))
    where (starts_at at time zone 'Europe/Rome')::date > tomorrow + 1), 'only three days');
  insert into t select 'slot', min(starts_at)::text from public.pickup_slots(tests.store('LU1'))
    where (starts_at at time zone 'Europe/Rome')::date = tomorrow;
end $$;

-- Anyone may read the hours and the slots; only managers write them.
set role anon;
do $$ begin
  perform tests.ok((select count(*) from public.store_opening_hours) >= 7, 'anon reads opening hours');
  perform tests.ok((select count(*) from public.pickup_slots(tests.store('LU1'))) > 0, 'anon reads slots');
end $$;
reset role;
select tests.login('00000000-0000-0000-0000-00000000000a');
set role authenticated;
do $$ begin
  perform tests.throws($q$insert into public.store_closures (store_id, day) values (tests.store('LU1'), current_date + 5)$q$,
    'row-level security|permission denied', 'customers cannot close a store');
end $$;
reset role;

-- Minimum order €10 on the goods.
update public.app_settings set min_order_cents = 1000;
select tests.login('00000000-0000-0000-0000-00000000000a');
set role authenticated;
do $$
declare r jsonb; v_slot text := (select v from t where k = 'slot');
begin
  perform tests.throws($q$select public.create_order(tests.cart('LU1', 'store', '{"carta-cucina": 1}'))$q$,
    'below_minimum_order', 'below €10 refused');
  -- Pay in store is for store pickup only, and the slot must be one of the offered ones.
  perform tests.throws($q$select public.create_order(tests.cart('LU1', 'home', '{"carta-cucina": 3}',
    '{"payment_method": "store", "address": {"full_name": "Cliente A", "line1": "Via Roma 1", "city": "Lucca", "province": "LU", "postal_code": "55100", "phone": "3331234567"}}'))$q$,
    'invalid_payment_method', 'no pay in store for home delivery');
  perform tests.throws($q$select public.create_order(tests.cart('LU1', 'store', '{"carta-cucina": 3}', '{"pickup_slot_start": "2020-01-01T10:00:00Z"}'))$q$,
    'invalid_pickup_slot', 'past slot refused');
  perform tests.throws($q$select public.create_order(tests.cart('LU1', 'store', '{"carta-cucina": 3}', '{"pickup_slot_start": "domani"}'))$q$,
    'invalid_pickup_slot', 'garbage slot refused');

  r := public.create_order(tests.cart('LU1', 'store', '{"carta-cucina": 3}',
    jsonb_build_object('payment_method', 'store', 'pickup_slot_start', v_slot)));
  perform tests.eq(r ->> 'status', 'paid', 'pay in store: received at once');
  perform tests.eq(r ->> 'payment_method', 'store', 'payment method returned');
  insert into t values ('order', r ->> 'id');
  perform tests.eq((select payment_status from public.orders where id = (r ->> 'id')::uuid), 'unpaid', 'not paid yet');
  perform tests.eq((select pickup_slot_start from public.orders where id = (r ->> 'id')::uuid), v_slot::timestamptz, 'slot stored');
  perform tests.eq((select pickup_slot_end - pickup_slot_start from public.orders where id = (r ->> 'id')::uuid), interval '1 hour', 'one hour');
  perform tests.eq((select count(*)::int from public.order_events where order_id = (r ->> 'id')::uuid and status = 'paid'), 1, 'received event (email)');

  -- Card orders still wait for the payment, with a slot.
  r := public.create_order(tests.cart('LU1', 'store', '{"carta-cucina": 3}', jsonb_build_object('pickup_slot_start', v_slot)));
  perform tests.eq(r ->> 'status', 'pending_payment', 'card order waits for Stripe');
  perform tests.ok(public.customer_cancel_order((r ->> 'id')::uuid), 'unpaid card order cancelled by the customer');
end $$;
reset role;

-- The customer cancels a pay-in-store order before it is prepared: stock back.
do $$ declare before int := tests.stock('LU1', 'carta-cucina'); begin insert into t values ('stock', before::text); end $$;
select tests.login('00000000-0000-0000-0000-00000000000a');
set role authenticated;
do $$
declare r jsonb;
begin
  r := public.create_order(tests.cart('LU1', 'store', '{"carta-cucina": 3}', '{"payment_method": "store"}'));
  insert into t values ('order2', r ->> 'id');
  perform tests.ok(public.customer_cancel_order((r ->> 'id')::uuid), 'cancelled');
  perform tests.throws(format('select public.customer_cancel_order(%L)', (select v from t where k = 'order2')), 'order_not_cancellable', 'only once');
end $$;
reset role;
do $$ begin
  perform tests.eq(tests.stock('LU1', 'carta-cucina'), (select v::int from t where k = 'stock'), 'stock released');
end $$;

-- Store staff prepare and hand over: completing records the payment at the till.
select tests.login('00000000-0000-0000-0000-0000000000c1');
set role authenticated;
do $$
declare v_order uuid := (select v::uuid from t where k = 'order');
begin
  perform public.staff_set_order_status(v_order, 'picking');
  perform public.staff_set_order_status(v_order, 'ready');
  perform public.staff_set_order_status(v_order, 'completed');
end $$;
reset role;
do $$ declare o public.orders; begin
  select * into o from public.orders where id = (select v::uuid from t where k = 'order');
  perform tests.eq(o.status, 'completed', 'completed');
  perform tests.eq(o.payment_status, 'paid', 'paid at the till');
  perform tests.ok(o.paid_at is not null, 'paid_at set');
  perform tests.eq((select count(*)::int from public.order_events where order_id = o.id and kind = 'payment'), 1, 'payment event');
end $$;

-- The customer cannot cancel once the store is preparing it.
select tests.login('00000000-0000-0000-0000-00000000000a');
set role authenticated;
do $$
declare r jsonb;
begin
  r := public.create_order(tests.cart('LU1', 'store', '{"carta-cucina": 3}', '{"payment_method": "store"}'));
  insert into t values ('order3', r ->> 'id');
end $$;
reset role;
select tests.login('00000000-0000-0000-0000-0000000000c1');
set role authenticated;
select public.staff_set_order_status((select v::uuid from t where k = 'order3'), 'picking');
reset role;
select tests.login('00000000-0000-0000-0000-00000000000a');
set role authenticated;
do $$ begin
  perform tests.throws(format('select public.customer_cancel_order(%L)', (select v from t where k = 'order3')), 'order_not_cancellable', 'too late');
end $$;
reset role;

-- The ERP fills an empty brand and keeps an existing one.
update public.products set erp_code = sku where sku in ('carta-cucina', 'detergente-lavatrice');
update public.products set brand = null where sku = 'carta-cucina';
update public.products set brand = 'Scelta admin' where sku = 'detergente-lavatrice';
do $$ begin
  perform public.erp_apply_batch(jsonb_build_object('store_code', 'LU1', 'sent_at', now(), 'products', jsonb_build_array(
    jsonb_build_object('erp_code', 'carta-cucina', 'brand', 'Regina', 'vat_rate', 22),
    jsonb_build_object('erp_code', 'detergente-lavatrice', 'brand', 'Dash', 'vat_rate', 22))));
  perform tests.eq((select brand from public.products where sku = 'carta-cucina'), 'Regina', 'brand filled');
  perform tests.eq((select brand from public.products where sku = 'detergente-lavatrice'), 'Scelta admin', 'brand kept');
end $$;

rollback;
