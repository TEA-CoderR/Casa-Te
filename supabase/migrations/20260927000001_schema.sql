-- CASA & TE commerce platform — core schema.
-- Money: integer euro cents. Weight: integer grams. Prices are VAT-inclusive (Italian retail).

create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------------
-- Utility: updated_at trigger
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Stores
-- ---------------------------------------------------------------------------
create table public.stores (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9_-]{2,12}$'),
  name text not null check (length(trim(name)) > 0),
  city text not null,
  address text,
  postal_code text check (postal_code is null or postal_code ~ '^\d{5}$'),
  province text,
  phone text,
  email text,
  opening_hours text,
  pickup_enabled boolean not null default true,   -- customers can collect here
  ships_orders boolean not null default true,     -- can fulfil home / pickup-point orders
  active boolean not null default true,
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger stores_touch before update on public.stores for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Catalogue
-- ---------------------------------------------------------------------------
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (length(trim(name)) > 0),
  parent_id uuid references public.categories(id) on delete set null,
  sort integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger categories_touch before update on public.categories for each row execute function public.touch_updated_at();

create table public.products (
  id uuid primary key default gen_random_uuid(),
  sku text not null unique check (sku ~ '^[A-Za-z0-9._-]{1,40}$'),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (length(trim(name)) between 1 and 200),
  description text,
  brand text,
  category_id uuid references public.categories(id) on delete set null,
  price_cents integer not null check (price_cents > 0),
  compare_at_price_cents integer check (compare_at_price_cents is null or compare_at_price_cents > price_cents),
  vat_rate numeric(4,2) not null default 22 check (vat_rate in (0, 4, 5, 10, 22)),
  weight_g integer not null check (weight_g > 0),
  barcode text check (barcode is null or barcode ~ '^\d{8,14}$'),
  max_per_order integer not null default 99 check (max_per_order between 1 and 99),
  active boolean not null default true,
  featured boolean not null default false,
  search_text text generated always as (
    lower(name || ' ' || coalesce(brand, '') || ' ' || sku || ' ' || coalesce(barcode, ''))
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index products_category_idx on public.products (category_id) where active;
create index products_featured_idx on public.products (featured) where active and featured;
create index products_search_idx on public.products using gin (search_text extensions.gin_trgm_ops);
create trigger products_touch before update on public.products for each row execute function public.touch_updated_at();

create table public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  -- Storage object path inside bucket "product-images", or an absolute https URL.
  path text not null,
  alt text,
  sort integer not null default 0,
  created_at timestamptz not null default now()
);
create index product_images_product_idx on public.product_images (product_id, sort);

-- Stock per store. Orders reserve (decrement) stock at creation and release on cancel/expiry.
create table public.inventory (
  store_id uuid not null references public.stores(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  quantity integer not null default 0 check (quantity >= 0),
  updated_at timestamptz not null default now(),
  primary key (store_id, product_id)
);
create index inventory_product_idx on public.inventory (product_id);
create trigger inventory_touch before update on public.inventory for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Fulfilment configuration
-- ---------------------------------------------------------------------------
create table public.pickup_points (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  carrier text,
  address text not null,
  city text not null,
  postal_code text not null check (postal_code ~ '^\d{5}$'),
  province text not null,
  opening_hours text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger pickup_points_touch before update on public.pickup_points for each row execute function public.touch_updated_at();

create table public.shipping_rates (
  id uuid primary key default gen_random_uuid(),
  method text not null check (method in ('home', 'pickup')),
  priority integer not null default 100,
  min_subtotal_cents integer not null default 0 check (min_subtotal_cents >= 0),
  max_subtotal_cents integer check (max_subtotal_cents is null or max_subtotal_cents >= min_subtotal_cents),
  min_weight_g integer not null default 0 check (min_weight_g >= 0),
  max_weight_g integer check (max_weight_g is null or max_weight_g >= min_weight_g),
  price_cents integer not null check (price_cents >= 0),
  provisional boolean not null default false,
  active boolean not null default true,
  label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index shipping_rates_lookup_idx on public.shipping_rates (method, priority) where active;
create trigger shipping_rates_touch before update on public.shipping_rates for each row execute function public.touch_updated_at();

create table public.coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9_-]{3,32}$'),
  description text,
  kind text not null check (kind in ('percent', 'fixed', 'free_shipping')),
  value integer not null default 0 check (value >= 0),
  min_subtotal_cents integer not null default 0 check (min_subtotal_cents >= 0),
  starts_at timestamptz,
  ends_at timestamptz,
  max_redemptions integer check (max_redemptions is null or max_redemptions > 0),
  per_customer_limit integer check (per_customer_limit is null or per_customer_limit > 0) default 1,
  redemptions integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (kind <> 'percent' or value between 1 and 100),
  check (kind <> 'fixed' or value > 0),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);
create trigger coupons_touch before update on public.coupons for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- People
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  preferred_store_id uuid references public.stores(id) on delete set null,
  marketing_opt_in boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();

create table public.addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text,
  full_name text not null,
  line1 text not null,
  line2 text,
  city text not null,
  province text not null check (province ~ '^[A-Z]{2}$'),
  postal_code text not null check (postal_code ~ '^\d{5}$'),
  phone text not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index addresses_user_idx on public.addresses (user_id);
create unique index addresses_one_default on public.addresses (user_id) where is_default;
create trigger addresses_touch before update on public.addresses for each row execute function public.touch_updated_at();

create table public.staff_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'manager', 'store_staff')),
  store_id uuid references public.stores(id) on delete restrict,
  display_name text,
  email text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (role <> 'store_staff' or store_id is not null)
);
create trigger staff_members_touch before update on public.staff_members for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Orders
-- ---------------------------------------------------------------------------
create sequence public.order_number_seq start 1001;

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique
    default ('CT' || to_char(now() at time zone 'Europe/Rome', 'YY') || lpad(nextval('public.order_number_seq')::text, 6, '0')),
  -- Nullable so orders survive account deletion (fiscal retention).
  user_id uuid references auth.users(id) on delete set null,
  store_id uuid not null references public.stores(id),
  fulfilment text not null check (fulfilment in ('home', 'pickup', 'store')),
  status text not null default 'pending_payment'
    check (status in ('pending_payment', 'paid', 'picking', 'ready', 'shipped', 'completed', 'cancelled')),
  payment_status text not null default 'unpaid'
    check (payment_status in ('unpaid', 'paid', 'partially_refunded', 'refunded', 'failed')),
  subtotal_cents integer not null check (subtotal_cents >= 0),
  discount_cents integer not null default 0 check (discount_cents >= 0),
  shipping_cents integer not null check (shipping_cents >= 0),
  total_cents integer not null check (total_cents >= 50),
  refunded_cents integer not null default 0 check (refunded_cents >= 0),
  total_weight_g integer not null check (total_weight_g >= 0),
  shipping_provisional boolean not null default false,
  coupon_id uuid references public.coupons(id) on delete set null,
  coupon_code text,
  customer_email text,
  customer_name text,
  customer_phone text,
  shipping_address jsonb,
  pickup_point_id uuid references public.pickup_points(id) on delete set null,
  pickup_point_snapshot jsonb,
  invoice_requested boolean not null default false,
  invoice_details jsonb,
  notes text check (notes is null or length(notes) <= 500),
  carrier text,
  tracking_number text,
  tracking_url text,
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text unique,
  expires_at timestamptz not null default (now() + interval '35 minutes'),
  paid_at timestamptz,
  cancelled_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (total_cents = subtotal_cents - discount_cents + shipping_cents),
  check (refunded_cents <= total_cents),
  check (fulfilment <> 'home' or shipping_address is not null),
  check (fulfilment <> 'pickup' or pickup_point_id is not null or pickup_point_snapshot is not null)
);
create index orders_user_idx on public.orders (user_id, created_at desc);
create index orders_store_status_idx on public.orders (store_id, status, created_at desc);
create index orders_status_idx on public.orders (status, created_at desc);
create index orders_pending_expiry_idx on public.orders (expires_at) where status = 'pending_payment';
create trigger orders_touch before update on public.orders for each row execute function public.touch_updated_at();

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  sku text not null,
  name text not null,
  image_path text,
  unit_price_cents integer not null check (unit_price_cents > 0),
  vat_rate numeric(4,2) not null,
  weight_g integer not null,
  quantity integer not null check (quantity > 0),
  line_total_cents integer not null,
  picked_quantity integer not null default 0 check (picked_quantity >= 0),
  check (line_total_cents = unit_price_cents * quantity),
  check (picked_quantity <= quantity)
);
create index order_items_order_idx on public.order_items (order_id);
create index order_items_product_idx on public.order_items (product_id);

create table public.order_events (
  id bigserial primary key,
  order_id uuid not null references public.orders(id) on delete cascade,
  status text,
  kind text not null default 'status' check (kind in ('status', 'note', 'payment', 'refund', 'system')),
  note text,
  visible_to_customer boolean not null default true,
  actor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index order_events_order_idx on public.order_events (order_id, created_at);

create table public.refunds (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  amount_cents integer not null check (amount_cents > 0),
  reason text,
  stripe_refund_id text unique,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index refunds_order_idx on public.refunds (order_id);

-- Stripe webhook idempotency log.
create table public.stripe_events (
  id text primary key,
  type text not null,
  received_at timestamptz not null default now()
);

-- Auditable stock movements (manual adjustments, imports, orders).
create table public.inventory_movements (
  id bigserial primary key,
  store_id uuid not null references public.stores(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  delta integer not null,
  reason text not null check (reason in ('order_reserve', 'order_release', 'manual', 'import', 'stocktake')),
  order_id uuid references public.orders(id) on delete set null,
  actor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index inventory_movements_lookup_idx on public.inventory_movements (store_id, product_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Profiles are created automatically for every new auth user.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), ''))
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
