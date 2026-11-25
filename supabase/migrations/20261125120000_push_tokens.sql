-- Push notifications (plan v3 L2): the phone's Firebase Cloud Messaging token, saved by the signed-in customer when
-- they turn notifications on. notify-order-event sends "ready for pickup", cancellations, refunds and return
-- answers to these tokens (no marketing). A token belongs to one phone; signing in on it moves it to that customer.
create table public.push_tokens (
  token text primary key check (length(token) between 20 and 4096),
  user_id uuid not null references auth.users (id) on delete cascade,
  platform text not null check (platform in ('android', 'ios')),
  updated_at timestamptz not null default now()
);
create index push_tokens_user on public.push_tokens (user_id);
alter table public.push_tokens enable row level security;
create policy push_tokens_own on public.push_tokens for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke all on public.push_tokens from anon, authenticated;
grant select, insert, update, delete on public.push_tokens to authenticated;
grant select on public.push_tokens to anon;  -- no policy for anon: no rows (project convention, tests/db/sql/05_grants.sql)
grant all on public.push_tokens to service_role;

-- Saves this phone's token for the signed-in customer (taking it over from another account signed in before).
create or replace function public.register_push_token(p_token text, p_platform text)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = 'P0001'; end if;
  if p_platform not in ('android', 'ios') or p_token is null or length(p_token) not between 20 and 4096 then
    raise exception 'invalid_push_token' using errcode = 'P0001';
  end if;
  insert into public.push_tokens (token, user_id, platform, updated_at) values (p_token, auth.uid(), p_platform, now())
  on conflict (token) do update set user_id = excluded.user_id, platform = excluded.platform, updated_at = now();
end $$;
revoke all on function public.register_push_token(text, text) from public, anon;
grant execute on function public.register_push_token(text, text) to authenticated, service_role;
