-- Returns: customer request, manager decision, store receipt, voucher / card refund / exchange.
begin;
create temp table t (k text primary key, v text);
grant all on t to authenticated;

select tests.login('00000000-0000-0000-0000-00000000000a');
set role authenticated;
do $$ declare r jsonb; begin
  r := public.create_order(tests.cart('LU1', 'store', '{"carta-cucina": 3}'));
  insert into t values ('order', r ->> 'id');
end $$;
reset role;
-- The order was paid and collected 3 days ago.
update public.orders set status = 'completed', payment_status = 'paid', completed_at = now() - interval '3 days',
  stripe_payment_intent_id = 'pi_ret' where id = (select v::uuid from t where k = 'order');
insert into t select 'item', id::text from public.order_items where order_id = (select v::uuid from t where k = 'order');

select tests.login('00000000-0000-0000-0000-00000000000a');
set role authenticated;
do $$
declare v_order uuid := (select v::uuid from t where k = 'order'); v_item uuid := (select v::uuid from t where k = 'item'); r jsonb;
begin
  perform tests.throws(format($q$select public.create_return_request(%L, %L, 'damaged', null, 'refund', 'card', '{}')$q$,
    v_order, jsonb_build_array(jsonb_build_object('order_item_id', v_item, 'quantity', 1))), 'return_photos_required', 'photos needed for damage');
  perform tests.throws(format($q$select public.create_return_request(%L, %L, 'changed_mind', null, 'refund', 'card', '{}')$q$,
    v_order, jsonb_build_array(jsonb_build_object('order_item_id', v_item, 'quantity', 9))), 'return_quantity_invalid', 'not more than bought');
  perform tests.throws(format($q$select public.create_return_request(%L, %L, 'changed_mind', null, 'refund', null, '{}')$q$,
    v_order, jsonb_build_array(jsonb_build_object('order_item_id', v_item, 'quantity', 1))), 'return_refund_method_invalid', 'refund needs a method');
  perform tests.throws(format($q$select public.create_return_request(%L, %L, 'damaged', null, 'refund', 'card', array['someone-else/x.jpg'])$q$,
    v_order, jsonb_build_array(jsonb_build_object('order_item_id', v_item, 'quantity', 1))), 'return_photos_invalid', 'only own photos');

  r := public.create_return_request(v_order, jsonb_build_array(jsonb_build_object('order_item_id', v_item, 'quantity', 2)),
    'changed_mind', 'Non mi serve più', 'refund', 'voucher', '{}');
  perform tests.ok(r ->> 'return_number' like 'RESO-%', 'return number');
  perform tests.eq((r ->> 'amount_cents')::int, (select unit_price_cents * 2 from public.order_items where id = v_item), 'amount = goods value');
  insert into t values ('ret1', r ->> 'id');
  perform tests.eq(public.returnable_quantity(v_item), 1, 'one unit left to return');
  perform tests.eq((select count(*)::int from public.order_events where order_id = v_order and kind = 'return'), 1, 'customer sees the event');
  perform tests.throws($q$select public.staff_decide_return((select v::uuid from t where k = 'ret1'), true)$q$, 'forbidden', 'customer cannot approve');
  perform tests.throws($q$insert into public.return_requests (order_id, store_id, reason, resolution, amount_cents) values (gen_random_uuid(), gen_random_uuid(), 'other', 'exchange', 0)$q$,
    'permission denied', 'no direct writes');

  -- Exchange of the last unit (second request), then cancelled by the customer.
  r := public.create_return_request(v_order, jsonb_build_array(jsonb_build_object('order_item_id', v_item, 'quantity', 1)),
    'other', 'Colore diverso', 'exchange', null, '{}');
  insert into t values ('ret2', r ->> 'id');
  perform public.cancel_return_request((r ->> 'id')::uuid);
  perform tests.eq(public.returnable_quantity(v_item), 1, 'cancelled return frees the unit');
end $$;
reset role;

-- Store staff (LU1) cannot approve; a manager can.
select tests.login('00000000-0000-0000-0000-0000000000c1');
set role authenticated;
do $$ begin
  perform tests.throws($q$select public.staff_decide_return((select v::uuid from t where k = 'ret1'), true)$q$, 'forbidden', 'store staff cannot approve');
  perform tests.throws($q$select public.staff_receive_return((select v::uuid from t where k = 'ret1'))$q$, 'return_wrong_status', 'not before approval');
end $$;
reset role;

select tests.login((select user_id from public.staff_members where role = 'manager' and active limit 1));
set role authenticated;
do $$ begin
  perform tests.throws($q$select public.staff_decide_return((select v::uuid from t where k = 'ret1'), false)$q$, 'return_reject_reason_required', 'rejection needs a reason');
  perform public.staff_decide_return((select v::uuid from t where k = 'ret1'), true, null);
  perform tests.eq((select status from public.return_requests where id = (select v::uuid from t where k = 'ret1')), 'approved', 'approved');
end $$;
reset role;

select tests.login('00000000-0000-0000-0000-0000000000c1');
set role authenticated;
do $$ begin
  perform public.staff_receive_return((select v::uuid from t where k = 'ret1'));
  perform tests.throws($q$select public.staff_issue_return_voucher((select v::uuid from t where k = 'ret1'))$q$, 'forbidden', 'store staff cannot refund');
end $$;
reset role;

select tests.login((select user_id from public.staff_members where role = 'manager' and active limit 1));
set role authenticated;
do $$ declare v_code text; begin
  v_code := public.staff_issue_return_voucher((select v::uuid from t where k = 'ret1'));
  insert into t values ('code', v_code);
  perform tests.ok(v_code like 'BUONO-%', 'voucher code');
  perform tests.eq((select status from public.return_requests where id = (select v::uuid from t where k = 'ret1')), 'refunded', 'refunded with voucher');
  perform tests.eq((select value from public.coupons where code = v_code),
    (select amount_cents from public.return_requests where id = (select v::uuid from t where k = 'ret1')), 'voucher value');
  perform tests.throws($q$select public.staff_issue_return_voucher((select v::uuid from t where k = 'ret1'))$q$, 'return_wrong_status', 'only once');
end $$;
reset role;

-- The voucher works only for its customer.
select tests.login('00000000-0000-0000-0000-00000000000b');
set role authenticated;
do $$ begin
  perform tests.eq(public.quote_cart(tests.cart('LU1', 'store', '{"carta-cucina": 1}', jsonb_build_object('coupon_code', (select v from t where k = 'code')))) ->> 'coupon_error',
    'coupon_not_found', 'other customers cannot use the voucher');
end $$;
reset role;
select tests.login('00000000-0000-0000-0000-00000000000a');
set role authenticated;
do $$ begin
  perform tests.eq(public.quote_cart(tests.cart('LU1', 'store', '{"carta-cucina": 1}', jsonb_build_object('coupon_code', (select v from t where k = 'code')))) ->> 'coupon_error',
    null, 'owner can use the voucher');
  perform tests.eq((select voucher_code from public.return_requests where id = (select v::uuid from t where k = 'ret1')),
    (select v from t where k = 'code'), 'customer sees the code on the return');
end $$;
reset role;

-- Window: a change of mind after 14 days is refused; a defect is still accepted.
update public.orders set completed_at = now() - interval '20 days' where id = (select v::uuid from t where k = 'order');
select tests.login('00000000-0000-0000-0000-00000000000a');
set role authenticated;
do $$ declare v_order uuid := (select v::uuid from t where k = 'order'); v_item uuid := (select v::uuid from t where k = 'item'); begin
  perform tests.throws(format($q$select public.create_return_request(%L, %L, 'changed_mind', null, 'refund', 'card', '{}')$q$,
    v_order, jsonb_build_array(jsonb_build_object('order_item_id', v_item, 'quantity', 1))), 'return_window_expired', '14 days for a change of mind');
  perform tests.ok(public.create_return_request(v_order, jsonb_build_array(jsonb_build_object('order_item_id', v_item, 'quantity', 1)),
    'damaged', null, 'exchange', null, array['00000000-0000-0000-0000-00000000000a/foto.jpg']) ? 'id', 'defects accepted later');
end $$;
reset role;

-- Other customers see nothing.
select tests.login('00000000-0000-0000-0000-00000000000b');
set role authenticated;
do $$ begin
  perform tests.eq((select count(*)::int from public.return_requests), 0, 'other customers see no returns');
end $$;
reset role;
rollback;
