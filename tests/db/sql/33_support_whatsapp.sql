-- WhatsApp number for customer service: managers set it in international format; everyone reads it.
begin;
select tests.login('00000000-0000-0000-0000-0000000000d1');
set role authenticated;
do $$ begin
  update public.app_settings set support_whatsapp = '+393331234567';
  perform tests.eq((select support_whatsapp from public.app_settings), '+393331234567', 'manager sets the number');
  perform tests.throws($q$update public.app_settings set support_whatsapp = '333 1234567'$q$, 'check', 'only +39… format');
end $$;
reset role;
set role anon;
do $$ begin
  perform tests.eq((select support_whatsapp from public.app_settings), '+393331234567', 'anyone reads it');
end $$;
reset role;
rollback;
