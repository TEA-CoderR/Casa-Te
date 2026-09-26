#!/usr/bin/env bash
# Two customers try to buy the last unit at the same time: exactly one must succeed.
set -euo pipefail
URL="$1"
PSQL=(psql "$URL" -X -q -v ON_ERROR_STOP=1 -At)
"${PSQL[@]}" -c "update public.inventory set quantity = 1 where store_id = tests.store('LU2') and product_id = tests.product('padella-28');" >/dev/null

order_sql() {
  cat <<SQL
select tests.login('$1');
set role authenticated;
begin;
select public.create_order(tests.cart('LU2', 'store', '{"padella-28": 1}')) ->> 'order_number';
select pg_sleep($2);
commit;
SQL
}

out_a="$(mktemp)"; out_b="$(mktemp)"
# A reserves first and holds its transaction open for 2s; B starts while A is still open.
( order_sql 00000000-0000-0000-0000-00000000000a 2 | psql "$URL" -X -q -At >"$out_a" 2>&1 ) &
sleep 0.5
( order_sql 00000000-0000-0000-0000-00000000000b 0 | psql "$URL" -X -q -At >"$out_b" 2>&1 ) &
wait

stock="$("${PSQL[@]}" -c "select tests.stock('LU2', 'padella-28');")"
orders="$("${PSQL[@]}" -c "select count(*) from public.orders o join public.order_items i on i.order_id = o.id
  where o.store_id = tests.store('LU2') and i.sku = 'padella-28' and o.status = 'pending_payment';")"
# Clean up so other suites are unaffected.
"${PSQL[@]}" -c "delete from public.orders where store_id = tests.store('LU2');
  update public.inventory set quantity = 25 where store_id = tests.store('LU2');" >/dev/null

if grep -q '^CT' "$out_a" && grep -q 'insufficient_stock' "$out_b" && [ "$stock" = "0" ] && [ "$orders" = "1" ]; then
  echo "  ✓ concurrency: last unit sold exactly once"
else
  echo "  ✗ concurrency: A=[$(cat "$out_a")] B=[$(cat "$out_b")] stock=$stock orders=$orders"; exit 1
fi
