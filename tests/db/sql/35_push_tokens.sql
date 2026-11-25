-- Push tokens: each customer sees and removes only their own; a phone signed in by another account moves to it.
begin;
select tests.login('00000000-0000-0000-0000-00000000000a');
set role authenticated;
do $$ begin
  perform public.register_push_token('fcm-token-of-phone-one-0000000000', 'android');
  perform tests.eq((select count(*)::int from public.push_tokens), 1, 'own token saved');
  perform tests.throws($q$select public.register_push_token('short', 'android')$q$, 'invalid_push_token', 'bad token refused');
end $$;
reset role;

select tests.login('00000000-0000-0000-0000-00000000000b');
set role authenticated;
do $$ begin
  perform tests.eq((select count(*)::int from public.push_tokens), 0, 'another customer sees none');
  perform public.register_push_token('fcm-token-of-phone-one-0000000000', 'android');
  perform tests.eq((select count(*)::int from public.push_tokens), 1, 'same phone, now this account');
  delete from public.push_tokens where token = 'fcm-token-of-phone-one-0000000000';
  perform tests.eq((select count(*)::int from public.push_tokens), 0, 'removed when notifications are turned off');
end $$;
reset role;

set role anon;
do $$ begin
  perform tests.throws($q$select public.register_push_token('fcm-token-of-phone-one-0000000000', 'android')$q$, 'permission denied', 'visitors cannot save tokens');
end $$;
reset role;
rollback;
