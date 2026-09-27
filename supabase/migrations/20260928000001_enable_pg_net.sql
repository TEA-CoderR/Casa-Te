-- pg_net: async HTTP from Postgres. Used by Supabase Database Webhooks (order_events →
-- notify-order-event) and for smoke-testing Edge Functions from SQL.
-- Skipped silently where pg_net is unavailable (local PostgreSQL test suite).
do $$
begin
  create extension if not exists pg_net with schema extensions;
exception when others then
  raise notice 'pg_net not available (%).', sqlerrm;
end $$;
