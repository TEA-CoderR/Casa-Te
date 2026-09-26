-- Keep the login email on the profile so staff can search customers and export marketing consent.
alter table public.profiles add column email text;
create index profiles_email_idx on public.profiles (lower(email));

update public.profiles p set email = u.email from auth.users u where u.id = p.id;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name, email)
  values (new.id, nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), ''), new.email)
  on conflict (id) do update set email = excluded.email;
  return new;
end $$;

create or replace function public.handle_user_email_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end $$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row when (old.email is distinct from new.email)
  execute function public.handle_user_email_change();

revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.handle_user_email_change() from public, anon, authenticated;

-- Customers can not change the email column directly (it follows auth.users).
revoke update on public.profiles from anon, authenticated;
grant update (full_name, phone, preferred_store_id, marketing_opt_in) on public.profiles to authenticated;
