-- Joining the Club needs name, phone, email and the privacy notice; leaving is one tap.
begin;
select tests.login('00000000-0000-0000-0000-00000000000b');
set role authenticated;
do $$
declare v timestamptz;
begin
  perform public.set_club_membership(false);
  perform tests.throws($q$select public.set_club_membership(true)$q$, 'club_details_required', 'one-tap join refused');
  perform tests.throws($q$select public.join_club('Mario', '+39 333 123 4567', true)$q$, 'club_name_required', 'surname required');
  perform tests.throws($q$select public.join_club('Mario Rossi', '12ab', true)$q$, 'club_phone_invalid', 'phone checked');
  perform tests.throws($q$select public.join_club('Mario Rossi', '1234', true)$q$, 'club_phone_invalid', 'phone too short');
  perform tests.throws($q$select public.join_club('Mario Rossi', '+39 333 123 4567', false)$q$, 'club_privacy_required', 'privacy notice required');
  perform tests.eq((select club_member_since from public.profiles where id = auth.uid()), null::timestamptz, 'not a member after refusals');

  v := public.join_club('  Mario   Rossi ', ' +39 333  123 4567 ', true, true);
  perform tests.ok(v is not null, 'joins with details');
  perform tests.eq((select full_name from public.profiles where id = auth.uid()), 'Mario Rossi', 'name saved');
  perform tests.eq((select phone from public.profiles where id = auth.uid()), '+39 333 123 4567', 'phone saved');
  perform tests.eq((select marketing_opt_in from public.profiles where id = auth.uid()), true, 'marketing consent saved');
  perform tests.ok((select club_terms_accepted_at is not null from public.profiles where id = auth.uid()), 'acceptance time saved');
  perform tests.eq(public.set_club_membership(true), v, 'already a member: unchanged');
  perform tests.eq(public.set_club_membership(false), null::timestamptz, 'leaves');
end $$;
reset role;

select tests.login(null, 'anon');
set role anon;
do $$ begin
  perform tests.throws($q$select public.join_club('Mario Rossi', '+39 333 123 4567', true)$q$, 'permission denied', 'guests cannot join');
end $$;
reset role;
rollback;
