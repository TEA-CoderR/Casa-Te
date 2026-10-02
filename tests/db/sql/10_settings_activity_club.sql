-- Settings, activity log, club administration and staff language.
begin;

-- Everyone reads the settings; only managers and admins change them.
set role anon;
do $$ begin
  perform tests.eq((select low_stock_threshold from public.app_settings), 3, 'anon reads settings');
  perform tests.eq((select club_enabled from public.app_settings), true, 'club enabled by default');
end $$;
reset role;

select tests.login('00000000-0000-0000-0000-0000000000c1');
set role authenticated;
do $$
declare n int;
begin
  update public.app_settings set low_stock_threshold = 50;
  get diagnostics n = row_count;
  perform tests.eq(n, 0, 'store staff cannot change settings');
  perform tests.throws($q$select public.admin_set_club_membership('00000000-0000-0000-0000-00000000000a', true)$q$, 'forbidden', 'store staff cannot manage the club');
  perform tests.eq((select count(*) from public.activity_log)::int, 0, 'store staff cannot read the activity log');
  perform tests.eq(public.set_my_locale('zh'), 'zh', 'staff choose their language');
  perform tests.eq((select locale from public.staff_members where user_id = auth.uid()), 'zh', 'language saved');
  perform tests.throws($q$select public.set_my_locale('fr')$q$, 'invalid_locale', 'unknown language refused');
end $$;
reset role;

select tests.login('00000000-0000-0000-0000-0000000000d1');
set role authenticated;
do $$
declare r public.activity_log;
begin
  update public.app_settings set low_stock_threshold = 5, club_tagline = 'Vantaggi per i soci';
  perform tests.eq((select low_stock_threshold from public.app_settings), 5, 'admin changes the threshold');
  select * into r from public.activity_log where entity = 'app_settings' order by id desc limit 1;
  perform tests.eq(r.action, 'update', 'settings change logged');
  perform tests.ok('low_stock_threshold' = any(r.changes), 'changed field recorded');
  perform tests.eq(r.details -> 'low_stock_threshold' ->> 1, '5', 'new value recorded');
  perform tests.ok(r.actor_name is not null, 'actor recorded');

  update public.products set price_cents = price_cents + 10 where sku = 'padella-28';
  perform tests.eq((select label from public.activity_log where entity = 'products' order by id desc limit 1),
    (select name from public.products where sku = 'padella-28'), 'product change logged with its name');
  update public.products set price_cents = price_cents where sku = 'padella-28';
  perform tests.eq((select count(*) from public.activity_log where entity = 'products' and actor_id is not null)::int, 1, 'no-op update not logged');

  perform tests.ok(public.admin_set_club_membership('00000000-0000-0000-0000-00000000000a', true) is not null, 'manager adds a member');
  perform tests.eq((select count(*) from public.activity_log where entity = 'profiles')::int, 1, 'club change logged');
  perform tests.ok(public.admin_set_club_membership('00000000-0000-0000-0000-00000000000a', false) is null, 'manager removes a member');
  perform tests.throws($q$insert into public.activity_log (entity, action) values ('x', 'insert')$q$, 'permission denied', 'log is read-only');
  perform tests.throws($q$update public.app_settings set low_stock_threshold = -1$q$, 'check', 'threshold validated');
end $$;
reset role;

-- The overview uses the threshold.
do $$ begin
  perform tests.eq((public.admin_overview(current_date - 6, current_date) ->> 'low_stock_threshold')::int, 5, 'overview uses the threshold');
end $$;

-- Customers' own club changes are not logged; joining is refused while the club is off.
select tests.login('00000000-0000-0000-0000-00000000000a');
set role authenticated;
do $$ begin
  perform tests.ok(public.set_club_membership(true) is not null, 'customer joins');
  perform tests.eq((select count(*) from public.activity_log)::int, 0, 'customers cannot read the log');
end $$;
reset role;
do $$ begin
  perform tests.eq((select count(*) from public.activity_log where entity = 'profiles')::int, 2, 'customer self-join not logged');
end $$;
update public.app_settings set club_enabled = false;
select tests.login('00000000-0000-0000-0000-00000000000a');
set role authenticated;
do $$ begin
  perform public.set_club_membership(false);
  perform tests.throws($q$select public.set_club_membership(true)$q$, 'club_disabled', 'cannot join a disabled club');
end $$;
reset role;

do $$ begin
  perform tests.ok(not has_function_privilege('anon', 'public.admin_set_club_membership(uuid, boolean)', 'execute'), 'anon cannot manage the club');
  perform tests.ok(not has_function_privilege('authenticated', 'public.log_activity()', 'execute'), 'trigger function not callable');
end $$;
set role anon;
do $$ begin
  perform tests.eq((select count(*) from public.activity_log)::int, 0, 'anon sees no log rows');
end $$;
reset role;

rollback;
