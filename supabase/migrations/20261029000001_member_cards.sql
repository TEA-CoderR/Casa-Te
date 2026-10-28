-- Linking an existing Casa & Te member card (tessera) to the online account.
--
-- The member list stays in the ERP. The sync agent, on CASA & TE's own PC, reads card number, phone and birth date
-- and sends only keyed hashes (HMAC-SHA256 with a key derived from ERP_SYNC_SECRET, never stored in the database):
--   card_hash  = H('C|' || card)
--   phone_hash = H('P|' || card || '|' || last 4 digits of the phone)   (null when the ERP has no phone)
--   birth_hash = H('B|' || card || '|' || YYYYMMDD)                     (null when the ERP has no birth date)
-- No name, phone, address or points ever reach the shop. Without the key the hashes cannot be checked.
--
-- A customer links a card in the app with the card number plus the last 4 phone digits or the birth date; the
-- member-card Edge Function computes the same hashes and calls member_card_link (service role only). Linking makes
-- the customer a Club member and keeps the card number on their own profile, so the app can show it as a barcode
-- at the till (points stay in the store system). Five failed attempts per hour per account, then a pause.

create table public.member_cards (
  card_hash text primary key check (card_hash ~ '^[0-9a-f]{64}$'),
  phone_hash text check (phone_hash ~ '^[0-9a-f]{64}$'),
  birth_hash text check (birth_hash ~ '^[0-9a-f]{64}$'),
  active boolean not null default true,
  sync_id text,
  synced_at timestamptz not null default now()
);
alter table public.member_cards enable row level security;
revoke all on public.member_cards from public, anon, authenticated;
grant select, insert, update, delete on public.member_cards to service_role;

create table public.member_card_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  ok boolean not null,
  created_at timestamptz not null default now()
);
create index member_card_attempts_user_idx on public.member_card_attempts (user_id, created_at desc);
alter table public.member_card_attempts enable row level security;
revoke all on public.member_card_attempts from public, anon, authenticated;
grant select, insert, update, delete on public.member_card_attempts to service_role;

alter table public.profiles
  add column member_card_number text check (member_card_number is null or member_card_number ~ '^[A-Z0-9]{4,30}$'),
  add column member_card_hash text unique,
  add column member_card_linked_at timestamptz;
-- Clients keep updating only their contact fields (column grants of 20260928000002 are unchanged).

-- ---------------------------------------------------------------------------
-- Sync from the ERP (erp-sync Edge Function, service role):
-- { "member_cards": [{ "card_hash", "phone_hash"?, "birth_hash"?, "active"? }], "sync_id": "…", "final": bool }
-- Every run sends all cards with the same sync_id; the final batch deactivates cards not seen in that run.
-- ---------------------------------------------------------------------------
create or replace function public.erp_apply_member_cards(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_sync text := nullif(trim(coalesce(p ->> 'sync_id', '')), '');
  v_rows integer;
  v_off integer := 0;
begin
  if v_sync is null or length(v_sync) > 64 then raise exception 'invalid_sync_id' using errcode = 'P0001'; end if;
  if jsonb_typeof(p -> 'member_cards') is distinct from 'array' or jsonb_array_length(p -> 'member_cards') > 10000 then
    raise exception 'invalid_member_cards' using errcode = 'P0001';
  end if;
  insert into public.member_cards as m (card_hash, phone_hash, birth_hash, active, sync_id, synced_at)
  select lower(e ->> 'card_hash'), lower(nullif(e ->> 'phone_hash', '')), lower(nullif(e ->> 'birth_hash', '')),
         coalesce((e ->> 'active')::boolean, true), v_sync, now()
  from jsonb_array_elements(p -> 'member_cards') e
  where coalesce(e ->> 'card_hash', '') ~* '^[0-9a-f]{64}$'
  on conflict (card_hash) do update set phone_hash = excluded.phone_hash, birth_hash = excluded.birth_hash,
    active = excluded.active, sync_id = excluded.sync_id, synced_at = excluded.synced_at;
  get diagnostics v_rows = row_count;
  if coalesce((p ->> 'final')::boolean, false) then
    update public.member_cards set active = false where sync_id is distinct from v_sync and active;
    get diagnostics v_off = row_count;
  end if;
  return jsonb_build_object('member_cards', v_rows, 'deactivated', v_off);
end $$;

-- ---------------------------------------------------------------------------
-- Linking (member-card Edge Function, service role). p_card is the normalised card number typed by the customer.
-- ---------------------------------------------------------------------------
create or replace function public.member_card_link(p_user uuid, p_card text, p_card_hash text, p_phone_hash text, p_birth_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_card public.member_cards;
  v_ok boolean;
  v_other uuid;
begin
  if p_user is null or not exists (select 1 from public.profiles where id = p_user) then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;
  if coalesce(p_card, '') !~ '^[A-Z0-9]{4,30}$' then raise exception 'invalid_card' using errcode = 'P0001'; end if;
  if (select count(*) from public.member_card_attempts
      where user_id = p_user and not ok and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'too_many_attempts' using errcode = 'P0001';
  end if;

  select * into v_card from public.member_cards where card_hash = lower(p_card_hash) and active;
  v_ok := found and ((p_phone_hash is not null and v_card.phone_hash = lower(p_phone_hash))
                  or (p_birth_hash is not null and v_card.birth_hash = lower(p_birth_hash)));
  insert into public.member_card_attempts (user_id, ok) values (p_user, v_ok);
  delete from public.member_card_attempts where created_at < now() - interval '30 days';
  -- Same answer whether the card does not exist or the check failed, so card numbers cannot be probed.
  -- Returned (not raised) so the failed attempt is kept for the rate limit.
  if not v_ok then return jsonb_build_object('linked', false, 'error', 'card_not_verified'); end if;

  select id into v_other from public.profiles where member_card_hash = v_card.card_hash and id <> p_user;
  if found then raise exception 'card_already_linked' using errcode = 'P0001'; end if;

  update public.profiles set member_card_number = p_card, member_card_hash = v_card.card_hash,
    member_card_linked_at = now(), club_member_since = coalesce(club_member_since, now())
  where id = p_user;
  return jsonb_build_object('linked', true, 'card', p_card);
end $$;

-- The customer removes the card from the account (Club membership stays).
create or replace function public.unlink_member_card()
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = 'P0001'; end if;
  update public.profiles set member_card_number = null, member_card_hash = null, member_card_linked_at = null
  where id = auth.uid();
end $$;

revoke all on function public.erp_apply_member_cards(jsonb) from public, anon, authenticated;
grant execute on function public.erp_apply_member_cards(jsonb) to service_role;
revoke all on function public.member_card_link(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.member_card_link(uuid, text, text, text, text) to service_role;
revoke all on function public.unlink_member_card() from public, anon;
grant execute on function public.unlink_member_card() to authenticated;
