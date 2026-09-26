-- Order creation, stock reservation, payment, expiry, fulfilment workflow and refunds.
begin;

select tests.login('00000000-0000-0000-0000-00000000000a');
set role authenticated;

do $$
declare r jsonb; o public.orders;
begin
  -- Validation errors
  perform tests.throws($q$select public.create_order(tests.cart('LU1', 'home', '{"carta-cucina": 1}'))$q$,
    'invalid_address', 'home delivery requires address');
  perform tests.throws($q$select public.create_order(tests.cart('LU1', 'home', '{"carta-cucina": 1}',
    '{"address":{"full_name":"Anna","line1":"Via Roma 1","city":"Lucca","province":"LU","postal_code":"551","phone":"3331234567"}}'))$q$,
    'invalid_address', 'CAP must have 5 digits');
  perform tests.throws($q$select public.create_order(tests.cart('LU1', 'pickup', '{"carta-cucina": 1}'))$q$,
    'invalid_pickup_point', 'pickup requires a pickup point');
  perform tests.throws($q$select public.create_order(tests.cart('LU1', 'store', '{"carta-cucina": 30}'))$q$,
    'cart_has_issues', 'cannot order more than stock');
  perform tests.throws($q$select public.create_order(tests.cart('LU1', 'drone', '{"carta-cucina": 1}'))$q$,
    'invalid_fulfilment', 'unknown fulfilment');
  perform tests.throws($q$select public.create_order(tests.cart('LU1', 'store', '{"carta-cucina": 1}',
    '{"invoice_requested": true, "invoice": {"tax_code": "123"}}'))$q$, 'invalid_invoice_details', 'invoice needs tax code or VAT');

  -- Happy path: home delivery, 2 x €12,99 (2,2 kg) -> €5,90 shipping.
  r := public.create_order(tests.cart('LU1', 'home', '{"padella-28": 2}',
    '{"address":{"full_name":"Anna Rossi","line1":"Via Roma 1","city":"Lucca","province":"lu","postal_code":"55100","phone":"333 1234567"},
      "notes":"Citofono Rossi", "subtotal_cents": 1, "total_cents": 1}'));
  perform tests.eq((r ->> 'total_cents')::int, 2598 + 590, 'server-side total ignores client amounts');
  select * into o from public.orders where id = (r ->> 'id')::uuid;
  perform tests.eq(o.status, 'pending_payment', 'new order pending payment');
  perform tests.eq(o.shipping_address ->> 'province', 'LU', 'province normalised');
  perform tests.eq(o.customer_name, 'Anna Rossi', 'customer name from address');
  perform tests.ok(o.order_number ~ '^CT\d{8}$', 'order number format');
  perform tests.eq((select sum(quantity) from public.order_items where order_id = o.id)::int, 2, 'items saved');
  perform tests.eq(tests.stock('LU1', 'padella-28'), 23, 'stock reserved at order creation');

  -- Pickup point order
  r := public.create_order(tests.cart('AR1', 'pickup', '{"carta-cucina": 1}',
    jsonb_build_object('pickup_point_id', (select id from public.pickup_points limit 1))));
  perform tests.eq((r ->> 'total_cents')::int, 499 + 390, 'pickup order total');
  perform tests.ok((select pickup_point_snapshot ->> 'name' from public.orders where id = (r ->> 'id')::uuid) is not null, 'pickup snapshot');

  -- Third pending order allowed, fourth rejected (anti-abuse).
  perform public.create_order(tests.cart('AR1', 'store', '{"carta-cucina": 1}'));
  perform tests.throws($q$select public.create_order(tests.cart('AR1', 'store', '{"carta-cucina": 1}'))$q$,
    'too_many_pending_orders', 'limit on unpaid orders');
end $$;
reset role;

-- Customer cancels an unpaid order -> stock released.
select tests.login('00000000-0000-0000-0000-00000000000a');
set role authenticated;
do $$
declare v_id uuid;
begin
  select id into v_id from public.orders where fulfilment = 'pickup';
  perform tests.eq(public.customer_cancel_pending_order(v_id), true, 'customer cancels unpaid order');
  perform tests.eq((select status from public.orders where id = v_id), 'cancelled', 'cancelled');
end $$;
reset role;
select tests.login('00000000-0000-0000-0000-00000000000b');
set role authenticated;
do $$ begin
  perform tests.throws(format('select public.customer_cancel_pending_order(%L)',
    (select id from public.orders where customer_email = 'cliente.a@example.com' limit 1)),
    'order_not_found', 'cannot cancel someone else''s order (not even visible)');
end $$;
reset role;

do $$ begin
  perform tests.eq(tests.stock('AR1', 'carta-cucina'), 24, 'released stock back (25 - 1 store order still pending)');
end $$;

-- Payment (service role, as the Stripe webhook does).
set role service_role;
do $$
declare v_id uuid; v_total int;
begin
  select id, total_cents into v_id, v_total from public.orders where fulfilment = 'home';
  perform public.attach_checkout_session(v_id, 'cs_test_1');
  perform tests.throws(format('select public.mark_order_paid(%L, %L, %L, %s)', v_id, 'cs_test_1', 'pi_1', v_total - 1),
    'amount_mismatch', 'amount must match');
  perform tests.eq(public.mark_order_paid(v_id, 'cs_test_1', 'pi_1', v_total), 'paid', 'marked paid');
  perform tests.eq(public.mark_order_paid(v_id, 'cs_test_1', 'pi_1', v_total), 'already_paid', 'webhook retry is idempotent');
  perform tests.eq((select status || '/' || payment_status from public.orders where id = v_id), 'paid/paid', 'status after payment');
  perform tests.eq(public.release_order(v_id), false, 'paid orders are never auto-released');
end $$;

-- Expiry: stale pending orders are released by the scheduled job.
do $$
declare v_id uuid; n int;
begin
  select id into v_id from public.orders where status = 'pending_payment' and store_id = tests.store('AR1') limit 1;
  update public.orders set expires_at = now() - interval '1 minute' where id = v_id;
  n := public.expire_stale_orders();
  perform tests.eq(n, 1, 'one stale order expired');
  perform tests.eq((select status from public.orders where id = v_id), 'cancelled', 'expired order cancelled');
  perform tests.eq(tests.stock('AR1', 'carta-cucina'), 25, 'expired order stock released');
  -- Late payment for an expired order must be refunded, not fulfilled.
  perform tests.eq(public.mark_order_paid(v_id, 'cs_late', 'pi_late', (select total_cents from public.orders where id = v_id)),
    'needs_refund', 'late payment flagged for refund');
  perform tests.eq((select status from public.orders where id = v_id), 'cancelled', 'late-paid order stays cancelled');
  perform tests.eq(tests.stock('AR1', 'carta-cucina'), 25, 'late payment does not consume stock');
end $$;
reset role;

-- Fulfilment workflow by LU1 store staff.
select tests.login('00000000-0000-0000-0000-0000000000c1');
set role authenticated;
do $$
declare v_id uuid; n int;
begin
  select id into v_id from public.orders where fulfilment = 'home';
  perform tests.throws(format($q$select public.staff_set_order_status(%L, 'shipped')$q$, v_id), 'invalid_transition', 'cannot skip picking');
  perform public.staff_set_order_status(v_id, 'picking');
  update public.order_items set picked_quantity = quantity where order_id = v_id;
  get diagnostics n = row_count;
  perform tests.eq(n, 1, 'picker records picked quantity');
  perform tests.throws(format($q$update public.order_items set picked_quantity = 99 where order_id = %L$q$, v_id),
    'check constraint', 'cannot pick more than ordered');
  perform public.staff_set_order_status(v_id, 'ready');
  perform tests.throws(format($q$select public.staff_set_order_status(%L, 'completed')$q$, v_id), 'invalid_transition', 'home order must ship first');
  perform tests.throws(format($q$select public.staff_set_order_status(%L, 'cancelled')$q$, v_id), 'forbidden', 'store staff cannot cancel');
  perform public.staff_set_order_status(v_id, 'shipped', 'Consegnato al corriere', 'BRT', 'ABC123', 'https://tracking.example/ABC123');
  perform tests.eq((select tracking_number from public.orders where id = v_id), 'ABC123', 'tracking saved');
  perform public.staff_set_order_status(v_id, 'completed');
  perform tests.ok((select completed_at is not null from public.orders where id = v_id), 'completed timestamp');
  perform public.staff_add_order_note(v_id, 'Cliente contattato', false);
end $$;
reset role;

-- Customer sees the timeline but not internal notes.
select tests.login('00000000-0000-0000-0000-00000000000a');
set role authenticated;
do $$ begin
  perform tests.eq((select count(*) from public.order_events e join public.orders o on o.id = e.order_id
                    where o.fulfilment = 'home' and e.kind = 'note')::int, 0, 'internal notes hidden');
  perform tests.eq((select count(*) from public.order_events e join public.orders o on o.id = e.order_id
                    where o.fulfilment = 'home' and e.kind = 'status')::int, 6, 'status timeline visible');
end $$;
reset role;

-- Cancellation of a paid order requires a refund first; then stock is restored.
select tests.login('00000000-0000-0000-0000-00000000000b');
set role authenticated;
select public.create_order(tests.cart('LU1', 'store', '{"lampada-tavolo": 3}'));
reset role;
set role service_role;
select public.mark_order_paid(id, null, 'pi_b', total_cents) from public.orders where customer_email = 'cliente.b@example.com';
reset role;
do $$ begin perform tests.eq(tests.stock('LU1', 'lampada-tavolo'), 22, 'reserved 3'); end $$;

select tests.login('00000000-0000-0000-0000-0000000000d1');
set role authenticated;
do $$
declare v_id uuid;
begin
  select id into v_id from public.orders where customer_email = 'cliente.b@example.com';
  perform tests.throws(format($q$select public.staff_set_order_status(%L, 'cancelled')$q$, v_id), 'refund_required', 'refund before cancel');
end $$;
reset role;

set role service_role;
do $$
declare v_id uuid; v_total int;
begin
  select id, total_cents into v_id, v_total from public.orders where customer_email = 'cliente.b@example.com';
  perform tests.eq(public.record_refund(v_id, 1000, 're_1', 'parziale', null), true, 'partial refund');
  perform tests.eq(public.record_refund(v_id, 1000, 're_1', 'parziale', null), false, 'refund webhook retry idempotent');
  perform tests.eq((select payment_status from public.orders where id = v_id), 'partially_refunded', 'partially refunded');
  perform tests.throws(format('select public.record_refund(%L, %s, %L, null, null)', v_id, v_total, 're_2'),
    'invalid_refund_amount', 'cannot refund more than paid');
  perform public.record_refund(v_id, v_total - 1000, 're_3', 'saldo', null);
  perform tests.eq((select payment_status from public.orders where id = v_id), 'refunded', 'fully refunded');
end $$;
reset role;

select tests.login('00000000-0000-0000-0000-0000000000d1');
set role authenticated;
do $$
declare v_id uuid;
begin
  select id into v_id from public.orders where customer_email = 'cliente.b@example.com';
  perform public.staff_set_order_status(v_id, 'cancelled', 'Richiesta cliente');
  perform tests.eq(tests.stock('LU1', 'lampada-tavolo'), 25, 'stock restored on cancel');
end $$;
reset role;

-- Audit trail covers every stock change.
do $$ begin
  perform tests.ok((select count(*) from public.inventory_movements where reason = 'order_reserve') >= 4, 'reservations logged');
  perform tests.ok((select count(*) from public.inventory_movements where reason = 'order_release') >= 3, 'releases logged');
end $$;

rollback;
