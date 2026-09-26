#!/usr/bin/env bash
# Starts a throwaway PostgreSQL 16 cluster, applies the Supabase stub, all migrations and the seed.
# Usage: tests/db/start-db.sh [datadir]   (prints the connection URL)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
DATA="${1:-${TMPDIR:-/tmp}/casa-te-testdb}"
PORT="${PGPORT:-54329}"

RUN_AS=""
if [ "$(id -u)" = "0" ]; then
  id postgres >/dev/null 2>&1 || useradd -r postgres
  RUN_AS="runuser -u postgres --"
fi
if [ -f "$DATA/postmaster.pid" ]; then $RUN_AS "$PGBIN/pg_ctl" -D "$DATA" -m immediate -w stop >/dev/null 2>&1 || true; fi
rm -rf "$DATA"
mkdir -p "$DATA"
[ -n "$RUN_AS" ] && chown postgres "$DATA"
$RUN_AS "$PGBIN/initdb" -D "$DATA" -U postgres -A trust >/dev/null
$RUN_AS "$PGBIN/pg_ctl" -D "$DATA" -o "-p $PORT -k /tmp -c listen_addresses=127.0.0.1" -l "$DATA/log" -w start >/dev/null

URL="postgresql://postgres@127.0.0.1:$PORT/postgres"
PSQL=(psql "$URL" -v ON_ERROR_STOP=1 -q -X)
"${PSQL[@]}" -f "$ROOT/tests/db/supabase-stub.sql" >/dev/null
for f in "$ROOT"/supabase/migrations/*.sql; do "${PSQL[@]}" -f "$f" >/dev/null 2>"$DATA/migrate.err" || { cat "$DATA/migrate.err"; echo "FAILED: $f" >&2; exit 1; }; done
"${PSQL[@]}" -f "$ROOT/supabase/seed.sql" >/dev/null
echo "$URL"
