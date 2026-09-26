#!/usr/bin/env bash
# Docker-free local Supabase-equivalent stack for end-to-end testing (Linux x86_64).
#   PostgreSQL 16 (local binaries) + Supabase Auth (GoTrue) + PostgREST + Edge Functions (Deno)
#   + gateway on :54321 + Stripe test-mode mock + Mailpit, then builds and serves the web shop
#   (:8081) and the admin console (:5173). Everything is local; no external account is needed.
# Usage: tools/local-stack/start.sh [--no-build]      Stop: tools/local-stack/stop.sh
# Prefer `supabase start` (Docker) + real Stripe test keys when available; see README.md.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
HERE="$ROOT/tools/local-stack"
TOOLS="$ROOT/.tools"; BIN="$TOOLS/bin"; STATE="$TOOLS/local-stack"; LOGS="$STATE/logs"
PGDATA="${TMPDIR:-/tmp}/casa-te-local-pg"
mkdir -p "$BIN" "$LOGS"

POSTGREST_VERSION=v12.2.12
AUTH_VERSION=v2.177.0
MAILPIT_VERSION=v1.31.2

PG_PORT=54322 GATEWAY_PORT=54321 POSTGREST_PORT=54330 FUNCTIONS_PORT=54331 GOTRUE_PORT=54332
SMTP_PORT=54325 MAIL_UI_PORT=54324 STRIPE_MOCK_PORT=12111 SHOP_PORT=8081 ADMIN_PORT=5173
API_URL="http://localhost:$GATEWAY_PORT"
JWT_SECRET="super-secret-jwt-token-with-at-least-32-characters-long"  # local only
STRIPE_SECRET_KEY="sk_test_local_mock"
STRIPE_WEBHOOK_SECRET="whsec_local_mock"

"$HERE/stop.sh" >/dev/null 2>&1 || true

# ---- binaries ---------------------------------------------------------------------------
fetch() { curl -fsSL --retry 3 "$1"; }
[ -x "$BIN/postgrest" ] || fetch "https://github.com/PostgREST/postgrest/releases/download/$POSTGREST_VERSION/postgrest-$POSTGREST_VERSION-linux-static-x86-64.tar.xz" | tar xJ -C "$BIN"
if [ ! -x "$BIN/auth/auth" ]; then
  mkdir -p "$BIN/auth"
  fetch "https://github.com/supabase/auth/releases/download/$AUTH_VERSION/auth-$AUTH_VERSION-x86.tar.gz" | tar xz -C "$BIN/auth"
fi
[ -x "$BIN/mailpit" ] || fetch "https://github.com/axllent/mailpit/releases/download/$MAILPIT_VERSION/mailpit-linux-amd64.tar.gz" | tar xz -C "$BIN" mailpit
DENO="$(command -v deno || true)"
if [ -z "$DENO" ]; then
  DENO="$BIN/deno"
  if [ ! -x "$DENO" ]; then
    fetch https://github.com/denoland/deno/releases/latest/download/deno-x86_64-unknown-linux-gnu.zip > "$BIN/deno.zip"
    python3 -c "import zipfile,sys; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])" "$BIN/deno.zip" "$BIN"
    chmod +x "$DENO"; rm "$BIN/deno.zip"
  fi
fi

# ---- keys -------------------------------------------------------------------------------
sign() { node -e '
  const c=require("crypto"),[s,role]=process.argv.slice(1),e=o=>Buffer.from(JSON.stringify(o)).toString("base64url");
  const h=e({alg:"HS256",typ:"JWT"}),p=e({iss:"supabase-local",role,iat:1700000000,exp:2000000000});
  process.stdout.write(`${h}.${p}.${c.createHmac("sha256",s).update(`${h}.${p}`).digest("base64url")}`)' "$JWT_SECRET" "$1"; }
ANON_KEY="$(sign anon)"; SERVICE_ROLE_KEY="$(sign service_role)"

# ---- PostgreSQL -------------------------------------------------------------------------
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
RUN_AS=""
if [ "$(id -u)" = "0" ]; then id postgres >/dev/null 2>&1 || useradd -r postgres; RUN_AS="runuser -u postgres --"; fi
rm -rf "$PGDATA"; mkdir -p "$PGDATA"; [ -n "$RUN_AS" ] && chown postgres "$PGDATA"
$RUN_AS "$PGBIN/initdb" -D "$PGDATA" -U postgres -A trust >/dev/null
$RUN_AS "$PGBIN/pg_ctl" -D "$PGDATA" -o "-p $PG_PORT -k /tmp -c listen_addresses=127.0.0.1" -l "$PGDATA/postgres.log" -w start >/dev/null
DB="postgresql://postgres@127.0.0.1:$PG_PORT/postgres"
PSQL=(psql "$DB" -v ON_ERROR_STOP=1 -q -X)
"${PSQL[@]}" -f "$HERE/platform.sql" >/dev/null

# Supabase Auth creates the auth schema with its own migrations (as on a hosted project).
(cd "$BIN/auth" && GOTRUE_DB_DRIVER=postgres DATABASE_URL="postgres://supabase_auth_admin:auth@127.0.0.1:$PG_PORT/postgres" \
  GOTRUE_DB_MIGRATIONS_PATH="$BIN/auth/migrations" GOTRUE_JWT_SECRET="$JWT_SECRET" API_EXTERNAL_URL="$API_URL/auth/v1" \
  GOTRUE_SITE_URL="http://localhost:$SHOP_PORT" ./auth migrate >"$LOGS/auth-migrate.log" 2>&1) \
  || { cat "$LOGS/auth-migrate.log"; exit 1; }
for f in "$ROOT"/supabase/migrations/*.sql "$ROOT/supabase/seed.sql"; do
  "${PSQL[@]}" -f "$f" >/dev/null 2>"$LOGS/migrate.err" || { cat "$LOGS/migrate.err"; echo "FAILED: $f" >&2; exit 1; }
done

# ---- services ---------------------------------------------------------------------------
start() { local name="$1"; shift; setsid "$@" >"$LOGS/$name.log" 2>&1 < /dev/null & echo $! > "$STATE/$name.pid"; }

start mailpit "$BIN/mailpit" --smtp "127.0.0.1:$SMTP_PORT" --listen "0.0.0.0:$MAIL_UI_PORT" --smtp-auth-accept-any --smtp-auth-allow-insecure

PGRST_DB_URI="postgres://authenticator:authenticator@127.0.0.1:$PG_PORT/postgres" PGRST_DB_SCHEMAS=public \
PGRST_DB_EXTRA_SEARCH_PATH=public,extensions PGRST_DB_ANON_ROLE=anon PGRST_JWT_SECRET="$JWT_SECRET" \
PGRST_DB_MAX_ROWS=1000 PGRST_SERVER_PORT=$POSTGREST_PORT PGRST_SERVER_HOST=127.0.0.1 \
  start postgrest "$BIN/postgrest"

(cd "$BIN/auth" && GOTRUE_DB_DRIVER=postgres DATABASE_URL="postgres://supabase_auth_admin:auth@127.0.0.1:$PG_PORT/postgres" \
  GOTRUE_DB_MIGRATIONS_PATH="$BIN/auth/migrations" \
  GOTRUE_API_HOST=127.0.0.1 PORT=$GOTRUE_PORT API_EXTERNAL_URL="$API_URL/auth/v1" \
  GOTRUE_SITE_URL="http://localhost:$SHOP_PORT" \
  GOTRUE_URI_ALLOW_LIST="casate://**,http://localhost:$SHOP_PORT/**,http://localhost:$ADMIN_PORT/**" \
  GOTRUE_JWT_SECRET="$JWT_SECRET" GOTRUE_JWT_EXP=3600 GOTRUE_JWT_AUD=authenticated GOTRUE_JWT_ISSUER="$API_URL/auth/v1" \
  GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated GOTRUE_JWT_ADMIN_ROLES=service_role \
  GOTRUE_DISABLE_SIGNUP=false GOTRUE_EXTERNAL_EMAIL_ENABLED=true GOTRUE_EXTERNAL_ANONYMOUS_USERS_ENABLED=false \
  GOTRUE_MAILER_AUTOCONFIRM=false GOTRUE_MAILER_SECURE_EMAIL_CHANGE_ENABLED=true \
  GOTRUE_MAILER_OTP_LENGTH=6 GOTRUE_MAILER_OTP_EXP=900 GOTRUE_RATE_LIMIT_EMAIL_SENT=30 \
  GOTRUE_SMTP_HOST=127.0.0.1 GOTRUE_SMTP_PORT=$SMTP_PORT GOTRUE_SMTP_USER=local GOTRUE_SMTP_PASS=local \
  GOTRUE_SMTP_ADMIN_EMAIL=noreply@casate.local GOTRUE_SMTP_SENDER_NAME="CASA & TE" \
  GOTRUE_MAILER_URLPATHS_INVITE=/auth/v1/verify GOTRUE_MAILER_URLPATHS_CONFIRMATION=/auth/v1/verify \
  GOTRUE_MAILER_URLPATHS_RECOVERY=/auth/v1/verify GOTRUE_MAILER_URLPATHS_EMAIL_CHANGE=/auth/v1/verify \
  GOTRUE_MAILER_TEMPLATES_MAGIC_LINK="$API_URL/__templates/magic_link.html" \
  GOTRUE_MAILER_TEMPLATES_CONFIRMATION="$API_URL/__templates/confirmation.html" \
  GOTRUE_MAILER_TEMPLATES_INVITE="$API_URL/__templates/invite.html" \
  GOTRUE_MAILER_TEMPLATES_RECOVERY="$API_URL/__templates/recovery.html" \
  GOTRUE_MAILER_SUBJECTS_MAGIC_LINK="Il tuo codice CASA & TE" GOTRUE_MAILER_SUBJECTS_CONFIRMATION="Il tuo codice CASA & TE" \
  GOTRUE_MAILER_SUBJECTS_INVITE="Invito alla console CASA & TE" \
  start auth ./auth serve)

SUPABASE_URL="$API_URL" SUPABASE_ANON_KEY="$ANON_KEY" SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY" \
STRIPE_SECRET_KEY="$STRIPE_SECRET_KEY" STRIPE_WEBHOOK_SECRET="$STRIPE_WEBHOOK_SECRET" \
STRIPE_API_BASE="http://127.0.0.1:$STRIPE_MOCK_PORT" WEB_SHOP_URL="http://localhost:$SHOP_PORT" \
ADMIN_URL="http://localhost:$ADMIN_PORT" APP_SCHEME=casate ALLOWED_ORIGINS='*' FUNCTIONS_PORT=$FUNCTIONS_PORT \
  start functions "$DENO" run --allow-net --allow-env --allow-read "$HERE/functions-server.ts"

STRIPE_MOCK_PORT=$STRIPE_MOCK_PORT STRIPE_MOCK_PUBLIC_URL="http://localhost:$STRIPE_MOCK_PORT" \
STRIPE_SECRET_KEY="$STRIPE_SECRET_KEY" STRIPE_WEBHOOK_SECRET="$STRIPE_WEBHOOK_SECRET" \
STRIPE_WEBHOOK_URL="$API_URL/functions/v1/stripe-webhook" \
  start stripe-mock node "$HERE/stripe-mock.mjs"

JWT_SECRET="$JWT_SECRET" GATEWAY_PORT=$GATEWAY_PORT POSTGREST_PORT=$POSTGREST_PORT GOTRUE_PORT=$GOTRUE_PORT \
FUNCTIONS_PORT=$FUNCTIONS_PORT start gateway node "$HERE/gateway.mjs"

# ---- apps -------------------------------------------------------------------------------
if [ "${1:-}" != "--no-build" ]; then
  (cd "$ROOT" && VITE_SUPABASE_URL="$API_URL" VITE_SUPABASE_ANON_KEY="$ANON_KEY" \
    npm run build -w @casa-te/admin >"$LOGS/build-admin.log" 2>&1) || { tail -30 "$LOGS/build-admin.log"; exit 1; }
  (cd "$ROOT" && EXPO_PUBLIC_SUPABASE_URL="$API_URL" EXPO_PUBLIC_SUPABASE_ANON_KEY="$ANON_KEY" \
    npm run build:web -w @casa-te/mobile >"$LOGS/build-shop.log" 2>&1) || { tail -30 "$LOGS/build-shop.log"; exit 1; }
fi
start shop node "$HERE/static.mjs" "$ROOT/apps/mobile/dist" $SHOP_PORT
start admin node "$HERE/static.mjs" "$ROOT/apps/admin/dist" $ADMIN_PORT

# ---- wait until healthy -----------------------------------------------------------------
for i in $(seq 1 60); do
  if curl -fs "$API_URL/auth/v1/health" >/dev/null && curl -fs -H "apikey: $ANON_KEY" "$API_URL/rest/v1/stores?select=id&limit=1" >/dev/null \
     && curl -s -o /dev/null "http://127.0.0.1:$FUNCTIONS_PORT/" && curl -fs "http://127.0.0.1:$STRIPE_MOCK_PORT/__mock/events" >/dev/null \
     && curl -fs "http://127.0.0.1:$SHOP_PORT/" >/dev/null && curl -fs "http://127.0.0.1:$ADMIN_PORT/" >/dev/null; then break; fi
  [ "$i" = 60 ] && { echo "stack did not become healthy; see $LOGS" >&2; exit 1; }
  sleep 1
done

cat > "$STATE/env" <<EOF
API_URL=$API_URL
ANON_KEY=$ANON_KEY
SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY
DB_URL=$DB
SHOP_URL=http://localhost:$SHOP_PORT
ADMIN_URL=http://localhost:$ADMIN_PORT
MAIL_URL=http://localhost:$MAIL_UI_PORT
STRIPE_MOCK_URL=http://localhost:$STRIPE_MOCK_PORT
EOF
echo "Local stack ready:"
sed 's/^/  /' "$STATE/env" | grep -v _KEY
echo "  keys/env: $STATE/env   logs: $LOGS"
