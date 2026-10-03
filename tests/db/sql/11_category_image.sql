-- Department cover photos: managers set them, everyone reads them, odd URLs are refused.
begin;
select tests.login('00000000-0000-0000-0000-0000000000d1');
set role authenticated;
do $$ begin
  update public.categories set image_path = 'categories/casa.jpg' where slug = 'casa';
  perform tests.eq((select image_path from public.categories where slug = 'casa'), 'categories/casa.jpg', 'manager sets a cover');
  perform tests.throws($q$update public.categories set image_path = 'javascript:alert(1)' where slug = 'casa'$q$, 'check', 'non-https schemes refused');
  update public.categories set image_path = 'https://cdn.example.com/casa.jpg' where slug = 'casa';
end $$;
reset role;
select tests.login('00000000-0000-0000-0000-0000000000c1');
set role authenticated;
do $$
declare n int;
begin
  update public.categories set image_path = null where slug = 'casa';
  get diagnostics n = row_count;
  perform tests.eq(n, 0, 'store staff cannot change covers');
end $$;
reset role;
select tests.logout();
set role anon;
do $$ begin
  perform tests.eq((select image_path from public.categories where slug = 'casa'), 'https://cdn.example.com/casa.jpg', 'anon reads the cover');
end $$;
reset role;
rollback;
