#!/usr/bin/env bash
# Stops everything started by tools/local-stack/start.sh.
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
STATE="$ROOT/.tools/local-stack"
PGDATA="${TMPDIR:-/tmp}/casa-te-local-pg"
for f in "$STATE"/*.pid; do
  [ -f "$f" ] || continue
  kill -- -"$(cat "$f")" 2>/dev/null || kill "$(cat "$f")" 2>/dev/null || true
  rm -f "$f"
done
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
RUN_AS=""; [ "$(id -u)" = "0" ] && RUN_AS="runuser -u postgres --"
[ -f "$PGDATA/postmaster.pid" ] && $RUN_AS "$PGBIN/pg_ctl" -D "$PGDATA" -m fast -w stop >/dev/null 2>&1
echo "local stack stopped"
