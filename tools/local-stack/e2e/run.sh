#!/usr/bin/env bash
# End-to-end run against the local stack: two customer orders on the web shop (browse → cart →
# email OTP → checkout → Stripe test payment), then first-admin setup, staff invite, store picking,
# shipment, partial refund and cancel-with-full-refund in the admin console.
# Usage: tools/local-stack/e2e/run.sh [--no-build]   (starts a fresh stack first; SKIP_STACK=1 to reuse)
# Screenshots: .tools/e2e-shots/. Needs Playwright's Chromium (`npx playwright install chromium`)
# or CHROMIUM_PATH pointing at a Chromium binary.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
E2E="$ROOT/tools/local-stack/e2e"
(cd "$E2E" && node --input-type=module -e "await import('playwright')" 2>/dev/null) || (cd "$ROOT" && npm install --no-save --no-audit --no-fund playwright@1.56 >/dev/null)
[ -n "${SKIP_STACK:-}" ] || "$ROOT/tools/local-stack/start.sh" "$@"
rm -rf "$ROOT/.tools/e2e-shots" "$ROOT/.tools/local-stack/e2e-state.json"
OUT="$ROOT/.tools/e2e-shots/customer-1" node "$E2E/customer.mjs"
OUT="$ROOT/.tools/e2e-shots/customer-2" node "$E2E/customer.mjs"
OUT="$ROOT/.tools/e2e-shots/admin" node "$E2E/admin.mjs"
echo; echo "e2e: all steps passed"
