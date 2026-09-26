CREATE TABLE IF NOT EXISTS accounts (
  id uuid PRIMARY KEY, email text NOT NULL UNIQUE, password_hash text NOT NULL,
  role text NOT NULL CHECK(role IN ('customer','operator')), store_ids text[] NOT NULL DEFAULT '{}',
  active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash text PRIMARY KEY, account_id uuid NOT NULL REFERENCES accounts(id), expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS login_attempts (
  identity_hash text PRIMARY KEY, attempts integer NOT NULL, reset_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS stores (
  id text PRIMARY KEY, name text NOT NULL, active boolean NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS products (
  sku text PRIMARY KEY, name text NOT NULL, price_cents integer NOT NULL CHECK(price_cents >= 0),
  weight_grams integer NOT NULL CHECK(weight_grams > 0), active boolean NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS inventory (
  store_id text REFERENCES stores(id), sku text REFERENCES products(sku),
  on_hand integer NOT NULL CHECK(on_hand >= 0), reserved integer NOT NULL DEFAULT 0 CHECK(reserved >= 0 AND reserved <= on_hand),
  PRIMARY KEY(store_id, sku)
);
CREATE TABLE IF NOT EXISTS quotes (
  id uuid PRIMARY KEY, customer_id text NOT NULL, snapshot jsonb NOT NULL, expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY, customer_id text NOT NULL, quote_id uuid NOT NULL UNIQUE REFERENCES quotes(id),
  idempotency_key text NOT NULL, snapshot jsonb NOT NULL,
  status text NOT NULL CHECK(status IN ('awaiting_payment','paid','preparing','ready_for_pickup','shipped','completed','cancelled')),
  version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), reservation_expires_at timestamptz NOT NULL DEFAULT now()+interval '15 minutes',
  UNIQUE(customer_id,idempotency_key)
);
CREATE TABLE IF NOT EXISTS order_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, order_id uuid NOT NULL REFERENCES orders(id),
  actor_id text NOT NULL, event_type text NOT NULL, payload jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS outbox (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, aggregate_id uuid NOT NULL REFERENCES orders(id),
  event_type text NOT NULL, payload jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), delivered_at timestamptz
);
CREATE INDEX IF NOT EXISTS orders_customer_created ON orders(customer_id,created_at DESC);
CREATE INDEX IF NOT EXISTS orders_pending_expiry ON orders(reservation_expires_at) WHERE status='awaiting_payment';
CREATE INDEX IF NOT EXISTS outbox_pending ON outbox(id) WHERE delivered_at IS NULL;
