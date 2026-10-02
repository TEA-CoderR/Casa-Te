-- Reviews (verified buyers), rating summary, product attributes and CASA & TE Club coupons.
begin;

-- Customer A buys carta-cucina (paid), customer B only has a pending order for padella-28.
select tests.login('00000000-0000-0000-0000-00000000000a');
set role authenticated;
select public.create_order(tests.cart('LU1', 'store', '{"carta-cucina": 1}'));
reset role;
select tests.login('00000000-0000-0000-0000-00000000000b');
set role authenticated;
select public.create_order(tests.cart('LU1', 'store', '{"padella-28": 1}'));
reset role;
set role service_role;
do $$
declare v_id uuid; v_total int;
begin
  select id, total_cents into v_id, v_total from public.orders where user_id = '00000000-0000-0000-0000-00000000000a';
  perform public.attach_checkout_session(v_id, 'cs_rev');
  perform tests.eq(public.mark_order_paid(v_id, 'cs_rev', 'pi_rev', v_total), 'paid', 'A paid');
end $$;
reset role;

-- Reviews
select tests.login('00000000-0000-0000-0000-00000000000a');
set role authenticated;
do $$
declare r jsonb;
begin
  perform tests.eq((public.can_review_product(tests.product('carta-cucina')) ->> 'eligible')::boolean, true, 'buyer can review');
  perform tests.eq((public.can_review_product(tests.product('padella-28')) ->> 'eligible')::boolean, false, 'non-buyer cannot review');
  perform tests.throws($q$select public.submit_review(tests.product('padella-28'), 5, 'x')$q$, 'review_not_allowed', 'review needs a purchase');
  perform tests.throws($q$select public.submit_review(tests.product('carta-cucina'), 6, null)$q$, 'invalid_rating', 'rating 1-5');
  r := public.submit_review(tests.product('carta-cucina'), 4, '  Ottima  ');
  perform tests.eq((r -> 'review' ->> 'rating')::int, 4, 'review saved');
  perform tests.eq(r -> 'review' ->> 'comment', 'Ottima', 'comment trimmed');
  r := public.submit_review(tests.product('carta-cucina'), 5, null);
  perform tests.eq((select count(*) from public.product_reviews)::int, 1, 'one review per customer and product');
  perform tests.throws($q$insert into public.product_reviews (product_id, user_id, author_name, rating) values (tests.product('padella-28'), auth.uid(), 'X', 5)$q$,
    'permission denied', 'no direct inserts');
  perform tests.throws($q$select user_id from public.product_reviews$q$, 'permission denied', 'reviewer id not exposed');
end $$;
do $$ declare n int; begin
  update public.products set rating_count = 99;
  get diagnostics n = row_count;
  perform tests.eq(n, 0, 'customers cannot touch products');
end $$;
reset role;

do $$ begin
  perform tests.eq((select rating_count from public.products where sku = 'carta-cucina'), 1, 'rating count synced');
  perform tests.eq((select rating_avg from public.products where sku = 'carta-cucina'), 5.0::numeric(2,1), 'rating average synced');
  perform tests.eq((select author_name from public.product_reviews), 'Cliente A.', 'public name is first name + initial');
end $$;

-- Staff cannot forge the summary; manager hides a review and the summary follows.
select tests.login('00000000-0000-0000-0000-0000000000d1');
set role authenticated;
do $$ begin
  update public.products set rating_count = 50, rating_avg = 1 where sku = 'carta-cucina';
  perform tests.eq((select rating_count from public.products where sku = 'carta-cucina'), 1, 'rating summary is read-only');
  update public.product_reviews set hidden = true;
  perform tests.eq((select rating_count from public.products where sku = 'carta-cucina'), 0, 'hidden review leaves the summary');
  perform tests.eq((select rating_avg from public.products where sku = 'carta-cucina'), null::numeric(2,1), 'no average without visible reviews');
  update public.product_reviews set hidden = false;
end $$;
reset role;

-- Store staff cannot moderate; anon reads visible reviews only (without reviewer ids).
select tests.login('00000000-0000-0000-0000-0000000000c1');
set role authenticated;
do $$ declare n int; begin
  update public.product_reviews set hidden = true;
  get diagnostics n = row_count;
  perform tests.eq(n, 0, 'store staff cannot moderate');
end $$;
reset role;
select tests.logout();
set role anon;
do $$ begin
  perform tests.eq((select count(*) from public.product_reviews)::int, 1, 'anon reads reviews');
  perform tests.throws($q$select public.submit_review(tests.product('carta-cucina'), 5, null)$q$, 'permission denied', 'anon cannot review');
  perform tests.throws($q$select public.club_offers()$q$, 'permission denied', 'anon has no club offers');
end $$;
reset role;

-- Product attributes
do $$ begin
  perform tests.throws($q$update public.products set unit = 'ml' where sku = 'detergente-lavatrice'$q$, 'products_unit_pair', 'unit needs a quantity');
  update public.products set unit = 'l', unit_quantity = 2, color = 'Bianco',
    highlights = '[{"icon":"leaf","label":"Formula delicata"}]', variant_group = 'detersivi', variant_label = '40 lavaggi'
    where sku = 'detergente-lavatrice';
  perform tests.throws($q$update public.products set highlights = '[{"icon":"rocket","label":"x"}]' where sku = 'carta-cucina'$q$,
    'invalid_highlights', 'highlight icons come from a fixed set');
  perform tests.throws($q$update public.products set highlights = '[{"icon":"leaf","label":"a"},{"icon":"leaf","label":"b"},{"icon":"leaf","label":"c"},{"icon":"leaf","label":"d"},{"icon":"leaf","label":"e"}]' where sku = 'carta-cucina'$q$,
    'products_highlights_shape', 'at most four highlights');
  perform tests.throws($q$update public.products set variant_group = 'x' where sku = 'carta-cucina'$q$,
    'products_variant_label', 'variant needs a label');
end $$;

-- Club-only coupons
insert into public.coupons (code, kind, value, club_only) values ('CLUB10', 'percent', 10, true);
select tests.login('00000000-0000-0000-0000-00000000000b');
set role authenticated;
do $$
declare q jsonb;
begin
  q := public.quote_cart(tests.cart('LU1', 'store', '{"carta-cucina": 2}', '{"coupon_code":"club10"}'));
  perform tests.eq(q ->> 'coupon_error', 'coupon_club_only', 'non-members cannot use club coupons');
  perform tests.eq((select count(*) from public.club_offers())::int, 0, 'no offers before joining');
  perform tests.ok(public.set_club_membership(true) is not null, 'joined the club');
  perform tests.eq(public.is_club_member(), true, 'is member');
  q := public.quote_cart(tests.cart('LU1', 'store', '{"carta-cucina": 2}', '{"coupon_code":"club10"}'));
  perform tests.eq(q ->> 'coupon_error', null, 'members can use club coupons');
  perform tests.eq((q ->> 'discount_cents')::int, round((q ->> 'subtotal_cents')::int * 0.1)::int, 'club discount applied');
  perform tests.eq((select code from public.club_offers()), 'CLUB10', 'member sees club offers');
  perform tests.throws($q$update public.profiles set club_member_since = now() - interval '1 year'$q$, 'permission denied', 'membership date only via RPC');
  perform tests.eq(public.set_club_membership(false), null::timestamptz, 'left the club');
end $$;
reset role;

rollback;
