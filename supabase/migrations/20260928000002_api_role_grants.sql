-- Explicit table privileges for the API roles.
-- Migrations 0001–0005 relied on Supabase's former default privileges (every new public table
-- granted to anon/authenticated/service_role, RLS doing the filtering). Newer Supabase projects no
-- longer grant anything by default, so on staging every direct table access failed with 42501
-- (e.g. the Stripe webhook's read of stripe_events). Grant explicitly, then re-apply the
-- narrowing from migrations 0002 and 0005. Row access is still decided by RLS.

grant usage on schema public to anon, authenticated, service_role;

grant select, insert, update, delete on all tables in schema public to anon, authenticated, service_role;
grant usage, select on all sequences in schema public to anon, authenticated, service_role;

-- Pickers can only change picked_quantity on an order line.
revoke update on public.order_items from anon, authenticated;
grant update (picked_quantity) on public.order_items to authenticated;

-- Profiles: narrow column grants; email follows auth.users (0005).
revoke update on public.profiles from anon, authenticated;
grant update (full_name, phone, preferred_store_id, marketing_opt_in) on public.profiles to authenticated;

-- Orders, their events and refunds are never written directly by clients (RPCs only).
revoke insert, update, delete on public.orders, public.order_events, public.refunds from anon, authenticated;
-- Stripe webhook idempotency log: service role only.
revoke all on public.stripe_events from anon, authenticated;
-- Stock movements are written by triggers only.
revoke insert, update, delete on public.inventory_movements from anon, authenticated;
