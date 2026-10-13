-- Legal entities behind the shop. CASA & TE GROUP runs the platform (operator); each store belongs to a company
-- that is the seller of the orders that store fulfils. Legal pages and order screens read these rows, so a new
-- store is opened from the admin (company + store) without changing code.

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  legal_name text not null check (length(trim(legal_name)) between 1 and 200),
  address text not null check (length(trim(address)) between 1 and 200),
  postal_code text not null check (postal_code ~ '^\d{5}$'),
  city text not null check (length(trim(city)) between 1 and 80),
  province text not null check (province ~ '^[A-Z]{2}$'),
  vat_number text not null unique check (vat_number ~ '^\d{11}$'),
  tax_code text check (tax_code is null or tax_code ~ '^([0-9]{11}|[A-Z0-9]{16})$'),
  rea text check (rea is null or length(trim(rea)) between 1 and 40),
  share_capital_cents bigint check (share_capital_cents is null or share_capital_cents >= 0),
  pec text check (pec is null or pec ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  email text check (email is null or email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  privacy_email text check (privacy_email is null or privacy_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone text check (phone is null or length(trim(phone)) between 3 and 40),
  is_operator boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- At most one platform operator.
create unique index companies_one_operator on public.companies (is_operator) where is_operator;
create trigger companies_touch before update on public.companies for each row execute function public.touch_updated_at();

alter table public.companies enable row level security;
-- Company identification is public by law (it is printed in the legal pages); only admins edit it.
create policy companies_read on public.companies for select using (true);
create policy companies_admin_insert on public.companies for insert to authenticated with check (public.is_admin());
create policy companies_admin_update on public.companies for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy companies_admin_delete on public.companies for delete to authenticated using (public.is_admin());

revoke all on public.companies from anon, authenticated;
grant select on public.companies to anon, authenticated;
grant insert, update, delete on public.companies to authenticated;
grant all on public.companies to service_role;

-- The company a store belongs to (the seller of that store's orders).
alter table public.stores add column company_id uuid references public.companies (id) on delete restrict;
create index stores_company_idx on public.stores (company_id);

-- Orders keep the seller as it was when the order was placed (legal record, survives later edits).
alter table public.orders
  add column seller_company_id uuid references public.companies (id) on delete set null,
  add column seller_snapshot jsonb;

create or replace function public.orders_set_seller()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v public.companies;
begin
  select c.* into v from public.stores s join public.companies c on c.id = s.company_id where s.id = new.store_id;
  if v.id is null then
    select c.* into v from public.companies c where c.is_operator;
  end if;
  if v.id is not null then
    new.seller_company_id := v.id;
    new.seller_snapshot := jsonb_build_object(
      'legal_name', v.legal_name, 'vat_number', v.vat_number, 'tax_code', v.tax_code, 'rea', v.rea,
      'address', v.address, 'postal_code', v.postal_code, 'city', v.city, 'province', v.province,
      'pec', v.pec, 'email', v.email);
  end if;
  return new;
end $$;
revoke all on function public.orders_set_seller() from public, anon, authenticated;
create trigger orders_set_seller before insert on public.orders for each row execute function public.orders_set_seller();
