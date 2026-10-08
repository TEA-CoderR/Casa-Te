-- Volantino: managers publish flyers, customers see only the current published ones.
begin;
select tests.login('00000000-0000-0000-0000-0000000000d1');
set role authenticated;
do $$ begin
  insert into public.flyers (title, valid_from, valid_to, page_paths)
    values ('Ottobre', current_date - 3, current_date + 10, array['2026/ottobre/p1.jpg', '2026/ottobre/p2.jpg']);
  insert into public.flyers (title, valid_from, valid_to, pdf_path)
    values ('Settembre', current_date - 40, current_date - 5, '2026/settembre.pdf');
  insert into public.flyers (title, pdf_path, active) values ('Bozza', '2026/bozza.pdf', false);
  insert into public.flyers (title, valid_from, pdf_path) values ('Novembre', current_date + 20, '2026/novembre.pdf');
  perform tests.eq((select count(*)::int from public.flyers), 4, 'manager sees every flyer');
  perform tests.throws($q$insert into public.flyers (title) values ('Vuoto')$q$, 'flyers_has_content', 'a flyer needs a PDF or pages');
  perform tests.throws($q$insert into public.flyers (title, pdf_path, valid_from, valid_to) values ('Date', 'a.pdf', current_date, current_date - 1)$q$,
    'flyers_dates', 'end before start refused');
  perform tests.throws($q$insert into public.flyers (title, pdf_path) values ('Link', 'javascript:alert(1)')$q$, 'check constraint', 'scheme refused');
  perform tests.throws($q$insert into public.flyers (title, page_paths) values ('Link', array['ok.jpg', 'data:image/png;base64,AA'])$q$, 'check constraint', 'page scheme refused');
  update public.flyers set title = 'Ottobre 2026' where title = 'Ottobre';
  perform tests.eq((select count(*)::int from public.flyers where title = 'Ottobre 2026'), 1, 'manager updates');
end $$;
reset role;

select tests.logout();
set role anon;
do $$ begin
  perform tests.eq((select array_agg(title order by title) from public.flyers), array['Ottobre 2026'], 'customers see only the current published flyer');
  perform tests.eq((select page_paths[2] from public.flyers), '2026/ottobre/p2.jpg', 'pages readable');
end $$;
reset role;

select tests.login('00000000-0000-0000-0000-0000000000c1');
set role authenticated;
do $$ begin
  perform tests.throws($q$insert into public.flyers (title, pdf_path) values ('Staff', 'x.pdf')$q$, 'row-level security', 'store staff cannot publish');
  update public.flyers set active = false;
  perform tests.eq((select count(*)::int from public.flyers where active), 1, 'store staff cannot change flyers');
end $$;
reset role;

do $$ begin
  perform tests.ok(not has_table_privilege('anon', 'public.flyers', 'insert'), 'anon cannot insert flyers');
  perform tests.ok(not has_function_privilege('anon', 'public.valid_asset_path(text)', 'execute'), 'anon cannot execute path check');
end $$;
rollback;
