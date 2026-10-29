-- Joining the Club needs the customer's details: name, phone, the account email and acceptance of the
-- Club privacy notice. Marketing consent is separate and optional.

alter table public.profiles add column if not exists club_terms_accepted_at timestamptz;

create or replace function public.join_club(p_full_name text, p_phone text, p_privacy boolean, p_marketing boolean default false)
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare
  v_name text := regexp_replace(trim(coalesce(p_full_name, '')), '\s+', ' ', 'g');
  v_phone text := regexp_replace(trim(coalesce(p_phone, '')), '\s+', ' ', 'g');
  v_digits text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_since timestamptz;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = 'P0001'; end if;
  if not (select club_enabled from public.app_settings) then raise exception 'club_disabled' using errcode = 'P0001'; end if;
  if length(v_name) < 3 or length(v_name) > 120 or position(' ' in v_name) = 0 then
    raise exception 'club_name_required' using errcode = 'P0001';
  end if;
  if v_phone !~ '^\+?[0-9 ]+$' or length(v_digits) < 8 or length(v_digits) > 15 then
    raise exception 'club_phone_invalid' using errcode = 'P0001';
  end if;
  if not coalesce(p_privacy, false) then raise exception 'club_privacy_required' using errcode = 'P0001'; end if;
  if coalesce((select email from auth.users where id = auth.uid()), '') = '' then
    raise exception 'club_email_required' using errcode = 'P0001';
  end if;

  update public.profiles
    set full_name = v_name, phone = v_phone, marketing_opt_in = coalesce(p_marketing, false),
      club_terms_accepted_at = now(), club_member_since = coalesce(club_member_since, now())
    where id = auth.uid()
    returning club_member_since into v_since;
  return v_since;
end $$;

-- Leaving stays one tap; joining without details is refused (older app versions get a clear error).
create or replace function public.set_club_membership(p_join boolean)
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare v_since timestamptz;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = 'P0001'; end if;
  if p_join then
    if not (select club_enabled from public.app_settings) then raise exception 'club_disabled' using errcode = 'P0001'; end if;
    select club_member_since into v_since from public.profiles where id = auth.uid();
    if v_since is null then raise exception 'club_details_required' using errcode = 'P0001'; end if;
    return v_since;
  end if;
  update public.profiles set club_member_since = null where id = auth.uid();
  return null;
end $$;

revoke all on function public.join_club(text, text, boolean, boolean) from public, anon;
grant execute on function public.join_club(text, text, boolean, boolean) to authenticated;
