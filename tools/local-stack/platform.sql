-- Supabase platform pieces for the Docker-free local stack (tools/local-stack).
-- Unlike tests/db/supabase-stub.sql, the `auth` schema is NOT emulated here: the real Supabase Auth
-- (GoTrue) server creates it with its own migrations, exactly like on a hosted project.
create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;
create role authenticator login noinherit password 'authenticator';
grant anon, authenticated, service_role to authenticator;

-- GoTrue connects as supabase_auth_admin and owns the auth schema (as on Supabase).
create role supabase_auth_admin login noinherit createrole password 'auth';
create schema auth authorization supabase_auth_admin;
alter role supabase_auth_admin set search_path = auth;

create schema extensions;
create schema storage;
grant usage on schema public, extensions to anon, authenticated, service_role;
grant usage on schema auth, storage to anon, authenticated, service_role;

-- Storage API is not run locally; only the tables the migrations reference.
create table storage.buckets (id text primary key, name text not null, public boolean default false);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text,
  owner uuid
);
alter table storage.objects enable row level security;
grant all on storage.objects, storage.buckets to anon, authenticated, service_role;

-- Newer Supabase projects grant NO table privileges to the API roles by default (migration
-- 20260928000002 grants them explicitly). Functions still get EXECUTE by default, which is the
-- worst case migration 0003 must lock down.
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
