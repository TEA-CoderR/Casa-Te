-- Companies: admins manage them, everyone reads them, orders snapshot the seller of the store.
begin;
select tests.login('00000000-0000-0000-0000-0000000000e1');
set role authenticated;
do $$ begin
  insert into public.companies (legal_name, address, postal_code, city, province, vat_number, is_operator)
    values ('Operatore Test S.R.L.', 'Via Uno 1', '55100', 'Lucca', 'LU', '00000000001', true);
  insert into public.companies (legal_name, address, postal_code, city, province, vat_number, rea, pec)
    values ('Negozio Test S.R.L.', 'Via Due 2', '55100', 'Lucca', 'LU', '00000000002', 'LU-1', 'negozio@pec.example.com');
  perform tests.throws($q$insert into public.companies (legal_name, address, postal_code, city, province, vat_number, is_operator)
    values ('Altro', 'Via Tre 3', '55100', 'Lucca', 'LU', '00000000003', true)$q$, 'companies_one_operator', 'only one operator');
  perform tests.throws($q$insert into public.companies (legal_name, address, postal_code, city, province, vat_number)
    values ('Altro', 'Via Tre 3', '55100', 'Lucca', 'LU', '123')$q$, 'check constraint', 'VAT number has 11 digits');
  perform tests.throws($q$insert into public.companies (legal_name, address, postal_code, city, province, vat_number)
    values ('Doppio', 'Via Tre 3', '55100', 'Lucca', 'LU', '00000000002')$q$, 'duplicate key', 'VAT number unique');
  update public.stores set company_id = (select id from public.companies where vat_number = '00000000002') where code = 'LU1';
  perform tests.ok((select company_id is not null from public.stores where code = 'LU1'), 'admin links store to company');
end $$;
reset role;

select tests.login('00000000-0000-0000-0000-0000000000d1');
set role authenticated;
do $$ begin
  perform tests.throws($q$insert into public.companies (legal_name, address, postal_code, city, province, vat_number)
    values ('Manager', 'Via Tre 3', '55100', 'Lucca', 'LU', '00000000004')$q$, 'row-level security', 'managers cannot add companies');
  update public.companies set legal_name = 'Cambiato';
  perform tests.eq((select count(*)::int from public.companies where legal_name = 'Cambiato'), 0, 'managers cannot edit companies');
end $$;
reset role;

select tests.logout();
set role anon;
do $$ begin
  perform tests.eq((select count(*)::int from public.companies), 2, 'legal data is public');
end $$;
reset role;

-- Orders: LU1 orders are sold by its company; a store without a company falls back to the operator.
select tests.login('00000000-0000-0000-0000-00000000000a');
set role authenticated;
do $$
declare r jsonb; o public.orders;
begin
  r := public.create_order(tests.cart('LU1', 'store', '{"carta-cucina": 1}'));
  select * into o from public.orders where id = (r ->> 'id')::uuid;
  perform tests.eq(o.seller_snapshot ->> 'legal_name', 'Negozio Test S.R.L.', 'order seller is the store company');
  perform tests.eq(o.seller_snapshot ->> 'vat_number', '00000000002', 'seller VAT snapshotted');
  perform tests.throws($q$update public.orders set seller_snapshot = '{}'$q$, 'permission denied', 'customer cannot change the seller');
end $$;
reset role;

do $$
declare o public.orders;
begin
  update public.companies set legal_name = 'Nuovo Nome S.R.L.' where vat_number = '00000000002';
  select * into o from public.orders order by created_at desc limit 1;
  perform tests.eq(o.seller_snapshot ->> 'legal_name', 'Negozio Test S.R.L.', 'snapshot survives later edits');
  perform tests.throws($q$delete from public.companies where vat_number = '00000000002'$q$, 'foreign key', 'company with stores cannot be deleted');
  perform tests.ok(not has_table_privilege('anon', 'public.companies', 'insert'), 'anon cannot insert companies');
  perform tests.ok(not has_function_privilege('authenticated', 'public.orders_set_seller()', 'execute'), 'trigger function not callable');
end $$;
rollback;
