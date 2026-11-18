-- Forced update and maintenance switch (plan v3 L5).
begin;

-- Only managers set them; everyone reads them.
select tests.login('00000000-0000-0000-0000-00000000000a');
set role authenticated;
do $$ begin
  update public.app_settings set maintenance_message = 'x';
  perform tests.ok((select maintenance_message from public.app_settings) is null, 'a customer cannot switch maintenance on');
end $$;
reset role;

select tests.login('00000000-0000-0000-0000-0000000000d1');
set role authenticated;
do $$ begin
  update public.app_settings set min_app_version = '1.3.0', maintenance_message = 'Torniamo alle 14:00.';
  perform tests.eq((select min_app_version from public.app_settings), '1.3.0', 'manager sets the minimum version');
  perform tests.throws($q$update public.app_settings set min_app_version = '1.3'$q$, 'check', 'version must be x.y.z');
end $$;
reset role;

set role anon;
do $$ begin
  perform tests.eq((select maintenance_message from public.app_settings), 'Torniamo alle 14:00.', 'anyone reads the message');
end $$;
reset role;

-- While in maintenance no order is created, whatever the app does.
select tests.login('00000000-0000-0000-0000-00000000000a');
do $$ begin
  perform tests.throws($q$select public.create_order(tests.cart('LU1', 'store', '{"carta-cucina": 3}'))$q$,
    'shop_maintenance', 'orders refused during maintenance');
end $$;

-- Switched off: orders work again.
update public.app_settings set maintenance_message = null;
do $$ declare r jsonb; begin
  r := public.create_order(tests.cart('LU1', 'store', '{"carta-cucina": 3}'));
  perform tests.ok(r ->> 'id' is not null, 'order created after maintenance');
end $$;
rollback;
