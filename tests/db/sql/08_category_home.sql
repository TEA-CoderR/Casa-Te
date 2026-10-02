-- Home page departments: at most 8, top-level only.
begin;
select tests.login('00000000-0000-0000-0000-0000000000d1');
set role authenticated;
do $$
declare i int;
begin
  for i in 1..9 loop
    insert into public.categories (slug, name, sort) values ('reparto-' || i, 'Reparto ' || i, 100 + i);
  end loop;
  update public.categories set show_on_home = true where slug in ('reparto-1','reparto-2','reparto-3','reparto-4','reparto-5','reparto-6','reparto-7','reparto-8');
  perform tests.eq((select count(*) from public.categories where show_on_home)::int, 8, 'eight departments on the home page');
  perform tests.throws($q$update public.categories set show_on_home = true where slug = 'reparto-9'$q$, 'home_max_8', 'a ninth is refused');
  update public.categories set show_on_home = false where slug = 'reparto-1';
  update public.categories set show_on_home = true where slug = 'reparto-9';
  perform tests.eq((select count(*) from public.categories where show_on_home)::int, 8, 'swap one for another');
  insert into public.categories (slug, name, parent_id) values ('sotto', 'Sotto', (select id from public.categories where slug = 'reparto-2'));
  perform tests.throws($q$update public.categories set show_on_home = true where slug = 'sotto'$q$, 'home_only_top_level|home_max_8', 'subcategories are not home departments');
end $$;
reset role;
select tests.logout();
set role anon;
do $$ begin
  perform tests.eq((select count(*) from public.categories where show_on_home)::int, 8, 'anon reads the home flag');
end $$;
reset role;
rollback;
