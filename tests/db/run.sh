#!/usr/bin/env bash
# Database test suite: fresh PostgreSQL + Supabase stub + migrations + seed, then every tests/db/sql/*.sql
# file in its own session (each file wraps itself in a rolled-back transaction).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
URL="${DATABASE_URL:-}"
if [ -z "$URL" ]; then URL="$("$ROOT/tests/db/start-db.sh")"; else
  for f in "$ROOT/tests/db/supabase-stub.sql" "$ROOT"/supabase/migrations/*.sql "$ROOT/supabase/seed.sql"; do
    psql "$URL" -v ON_ERROR_STOP=1 -q -X -f "$f" >/dev/null; done
fi
psql "$URL" -v ON_ERROR_STOP=1 -q -X -f "$ROOT/tests/db/helpers.sql" >/dev/null

TSX="$(command -v tsx || echo "npx tsx")"
(cd "$ROOT" && $TSX tests/db/gen-shipping-cases.ts)
SETUP="$ROOT/tests/db/.generated/setup.sql"
{ printf "select set_config('tests.shipping_cases', \$json\$"; cat "$ROOT/tests/db/.generated/shipping_cases.json"; printf "\$json\$, false);\n"; } > "$SETUP"

pass=0; fail=0
for t in "$ROOT"/tests/db/sql/*.sql; do
  name="$(basename "$t")"
  if out="$(psql "$URL" -v ON_ERROR_STOP=1 -q -X -f "$SETUP" -f "$t" 2>&1 >/dev/null)"; then
    echo "  ✓ $name"; pass=$((pass+1))
  else
    echo "  ✗ $name"; echo "$out" | grep -v '^NOTICE' | sed 's/^/      /'; fail=$((fail+1))
  fi
done
echo "db tests: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
