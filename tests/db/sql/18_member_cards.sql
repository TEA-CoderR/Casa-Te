-- Member cards: hashes from the ERP, linking with a second check, rate limit, one account per card.
begin;

do $$
declare r jsonb; h text := repeat('a', 64); ph text := repeat('b', 64); bh text := repeat('c', 64);
begin
  r := public.erp_apply_member_cards(jsonb_build_object('sync_id', 's1', 'final', true, 'member_cards', jsonb_build_array(
    jsonb_build_object('card_hash', h, 'phone_hash', ph, 'birth_hash', bh),
    jsonb_build_object('card_hash', repeat('d', 64)),
    jsonb_build_object('card_hash', 'not-a-hash'))));
  perform tests.eq((r ->> 'member_cards')::int, 2, 'valid hashes stored');
  r := public.erp_apply_member_cards(jsonb_build_object('sync_id', 's2', 'final', true, 'member_cards', jsonb_build_array(
    jsonb_build_object('card_hash', h, 'phone_hash', ph, 'birth_hash', bh))));
  perform tests.eq((r ->> 'deactivated')::int, 1, 'card missing from the run deactivated');
  perform tests.eq((select active from public.member_cards where card_hash = repeat('d', 64)), false, 'inactive');

  -- Wrong check: not linked, attempt kept; right phone check: linked and Club member.
  r := public.member_card_link('00000000-0000-0000-0000-00000000000a', '123456', h, repeat('e', 64), null);
  perform tests.eq(r ->> 'error', 'card_not_verified', 'wrong check refused');
  perform tests.eq((select count(*)::int from public.member_card_attempts where user_id = '00000000-0000-0000-0000-00000000000a' and not ok), 1, 'failed attempt kept');
  r := public.member_card_link('00000000-0000-0000-0000-00000000000a', '123456', repeat('d', 64), ph, null);
  perform tests.eq(r ->> 'error', 'card_not_verified', 'inactive card refused like an unknown one');
  r := public.member_card_link('00000000-0000-0000-0000-00000000000a', '123456', h, null, bh);
  perform tests.eq((r ->> 'linked')::boolean, true, 'birth date check links');
  perform tests.eq((select member_card_number from public.profiles where id = '00000000-0000-0000-0000-00000000000a'), '123456', 'card on profile');
  perform tests.ok((select club_member_since is not null from public.profiles where id = '00000000-0000-0000-0000-00000000000a'), 'becomes Club member');
  perform tests.throws($q$select public.member_card_link('00000000-0000-0000-0000-00000000000b', '123456', repeat('a', 64), repeat('b', 64), null)$q$,
    'card_already_linked', 'one account per card');

  -- Rate limit: 5 failures in an hour.
  for i in 1..5 loop
    perform public.member_card_link('00000000-0000-0000-0000-00000000000b', '999999', repeat('f', 64), repeat('f', 64), null);
  end loop;
  perform tests.throws($q$select public.member_card_link('00000000-0000-0000-0000-00000000000b', '123456', repeat('a', 64), repeat('b', 64), null)$q$,
    'too_many_attempts', 'paused after 5 failures');
end $$;

-- Customers: no access to the hashes or the link function; can unlink their own card.
select tests.login('00000000-0000-0000-0000-00000000000a');
set role authenticated;
do $$ begin
  perform tests.throws($q$select count(*) from public.member_cards$q$, 'permission denied', 'hashes not readable');
  perform tests.throws($q$select public.member_card_link('00000000-0000-0000-0000-00000000000a', '1234', repeat('a', 64), null, null)$q$, 'permission denied', 'link only via the function');
  perform tests.throws($q$update public.profiles set member_card_number = '9999' where id = auth.uid()$q$, 'permission denied', 'card not writable by clients');
  perform public.unlink_member_card();
  perform tests.eq((select member_card_number from public.profiles where id = auth.uid()), null::text, 'unlinked');
end $$;
reset role;
do $$ begin
  perform tests.ok(not has_function_privilege('anon', 'public.erp_apply_member_cards(jsonb)', 'execute'), 'anon cannot sync cards');
end $$;
rollback;
