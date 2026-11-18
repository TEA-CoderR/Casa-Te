-- Returns: one open request per order (the owner's choice, 4/11). Same function, one more check.
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
  -- One request at a time per order: while one is being handled (requested, approved, received) no other can be
  -- opened; the customer cancels it to change it, or asks again once it is closed.
  perform 1 from public.orders where id = v_order.id for update;
  if exists (select 1 from public.return_requests r where r.order_id = v_order.id and r.status in ('requested', 'approved', 'received')) then
    raise exception 'return_already_open' using errcode = 'P0001';
  end if;
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

revoke all on function public.create_return_request(uuid, jsonb, text, text, text, text, text[]) from public, anon;
grant execute on function public.create_return_request(uuid, jsonb, text, text, text, text, text[]) to authenticated;
