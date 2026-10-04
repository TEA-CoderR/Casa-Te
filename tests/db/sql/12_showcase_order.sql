-- Manual order of "In evidenza" and "In offerta": managers set it, others cannot, everyone reads it.
begin;
select tests.login('00000000-0000-0000-0000-0000000000d1');
set role authenticated;
do $$
declare a uuid := (select id from public.products where sku = 'padella-28');
        b uuid := (select id from public.products where sku = 'carta-cucina');
begin
  perform tests.eq(public.admin_set_showcase_order('featured', array[b, a]), 2, 'two products ordered');
  perform tests.eq((select featured_rank from public.products where id = b), 1, 'first position');
  perform tests.eq((select featured_rank from public.products where id = a), 2, 'second position');
  perform tests.eq(public.admin_set_showcase_order('featured', array[a]), 1, 'reordered');
  perform tests.eq((select featured_rank from public.products where id = a), 1, 'moved to first');
  perform tests.ok((select featured_rank from public.products where id = b) is null, 'dropped product loses its position');
  perform tests.eq(public.admin_set_showcase_order('offer', array[b]), 1, 'offer order is separate');
  perform tests.eq((select offer_rank from public.products where id = b), 1, 'offer position');
  perform tests.eq((select featured_rank from public.products where id = a), 1, 'featured order untouched');
  perform tests.throws($q$select public.admin_set_showcase_order('banner', array[]::uuid[])$q$, 'invalid_kind', 'unknown row refused');
  perform tests.throws(format($q$select public.admin_set_showcase_order('offer', array[%L::uuid, %L::uuid])$q$, a, a), 'invalid_order', 'duplicates refused');
  perform tests.eq(public.admin_set_showcase_order('offer', array[]::uuid[]), 0, 'empty list clears the order');
end $$;
reset role;

select tests.login('00000000-0000-0000-0000-0000000000c1');
set role authenticated;
do $$ begin
  perform tests.throws($q$select public.admin_set_showcase_order('featured', array[]::uuid[])$q$, 'forbidden', 'store staff refused');
end $$;
reset role;

select tests.logout();
set role anon;
do $$ begin
  perform tests.eq((select featured_rank from public.products where sku = 'padella-28'), 1, 'anon reads the position');
  perform tests.ok(not has_function_privilege('anon', 'public.admin_set_showcase_order(text, uuid[])', 'execute'), 'anon cannot execute');
end $$;
reset role;
rollback;
