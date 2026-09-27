-- Table privileges for the API roles. Newer Supabase projects grant nothing by default, so every
-- table the apps or Edge Functions touch needs an explicit GRANT (RLS then filters rows).
begin;

do $$
declare t text;
begin
  -- Every public table is reachable by service_role (Edge Functions) and readable by the API roles
  -- the apps use, except the webhook log.
  for t in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind = 'r' loop
    perform tests.ok(has_table_privilege('service_role', 'public.' || t, 'select,insert,update,delete'), 'service_role full access: ' || t);
    if t <> 'stripe_events' then
      perform tests.ok(has_table_privilege('authenticated', 'public.' || t, 'select'), 'authenticated can select (RLS filters): ' || t);
      perform tests.ok(has_table_privilege('anon', 'public.' || t, 'select'), 'anon can select (RLS filters): ' || t);
    end if;
  end loop;
end $$;

-- Narrowed privileges stay narrow.
select tests.ok(not has_table_privilege('anon', 'public.stripe_events', 'select'), 'anon cannot read stripe_events');
select tests.ok(not has_table_privilege('authenticated', 'public.stripe_events', 'select'), 'authenticated cannot read stripe_events');
select tests.ok(not has_table_privilege('authenticated', 'public.orders', 'insert'), 'clients cannot insert orders');
select tests.ok(not has_table_privilege('authenticated', 'public.orders', 'update'), 'clients cannot update orders');
select tests.ok(not has_table_privilege('authenticated', 'public.refunds', 'insert'), 'clients cannot insert refunds');
select tests.ok(not has_table_privilege('authenticated', 'public.inventory_movements', 'insert'), 'clients cannot write stock movements');
select tests.ok(not has_table_privilege('authenticated', 'public.order_items', 'update'), 'no table-wide update on order lines');
select tests.ok(has_column_privilege('authenticated', 'public.order_items', 'picked_quantity', 'update'), 'pickers update picked_quantity');
select tests.ok(not has_column_privilege('authenticated', 'public.order_items', 'unit_price_cents', 'update'), 'prices on order lines are read-only');
select tests.ok(has_column_privilege('authenticated', 'public.profiles', 'phone', 'update'), 'customers update their phone');
select tests.ok(not has_column_privilege('authenticated', 'public.profiles', 'email', 'update'), 'profile email follows auth.users');

rollback;
