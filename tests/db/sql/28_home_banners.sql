-- Home banners: managers publish them, customers see only the current published ones, in order.
begin;
select tests.login('00000000-0000-0000-0000-0000000000d1');
set role authenticated;
do $$ begin
  insert into public.home_banners (title, image_path, link_kind, sort, starts_on, ends_on)
    values ('Bucato', 'https://www.casaete.top/banners/2026-11/bucato.jpg', 'offers', 2, current_date - 1, current_date + 7);
  insert into public.home_banners (title, image_path, sort) values ('Caffè', '2026-11/caffe.jpg', 1);
  insert into public.home_banners (title, image_path, active) values ('Bozza', '2026-11/bozza.jpg', false);
  insert into public.home_banners (title, image_path, starts_on) values ('Natale', '2026-12/natale.jpg', current_date + 20);
  insert into public.home_banners (title, image_path, ends_on) values ('Vecchio', '2026-10/vecchio.jpg', current_date - 2);
  perform tests.eq((select count(*)::int from public.home_banners), 5, 'manager sees every banner');
  perform tests.throws($q$insert into public.home_banners (title, image_path, link_kind) values ('Reparto', 'a.jpg', 'category')$q$,
    'home_banners_link', 'a department link needs its id');
  perform tests.throws($q$insert into public.home_banners (title, image_path, link_kind, link_id) values ('Offerte', 'a.jpg', 'offers', gen_random_uuid())$q$,
    'home_banners_link', 'no id on a plain link');
  perform tests.throws($q$insert into public.home_banners (title, image_path, link_kind) values ('Web', 'a.jpg', 'url')$q$, 'check constraint', 'unknown link refused');
  perform tests.throws($q$insert into public.home_banners (title, image_path) values ('Script', 'javascript:alert(1)')$q$, 'check constraint', 'scheme refused');
  perform tests.throws($q$insert into public.home_banners (title, image_path, starts_on, ends_on) values ('Date', 'a.jpg', current_date, current_date - 1)$q$,
    'home_banners_dates', 'end before start refused');
end $$;
reset role;

select tests.logout();
set role anon;
do $$ begin
  perform tests.eq((select array_agg(title order by sort) from public.home_banners), array['Caffè', 'Bucato'], 'customers see only current published banners');
end $$;
reset role;

select tests.login('00000000-0000-0000-0000-0000000000c1');
set role authenticated;
do $$ begin
  perform tests.throws($q$insert into public.home_banners (title, image_path) values ('Staff', 'x.jpg')$q$, 'row-level security', 'store staff cannot publish');
  update public.home_banners set active = false;
  perform tests.eq((select count(*)::int from public.home_banners where active), 2, 'store staff cannot change banners');
end $$;
reset role;

do $$ begin
  perform tests.ok(not has_table_privilege('anon', 'public.home_banners', 'insert'), 'anon cannot insert banners');
end $$;
rollback;
