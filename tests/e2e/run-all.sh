#!/bin/bash
# Runs every browser test against a local stand-in for Supabase (real Postgres + PostgREST).
# One-time setup (Linux):  see tests/e2e/README.md
set -u
KIT="$(cd "$(dirname "$0")" && pwd)"; APP="${APP:-$(cd "$KIT/../.." && pwd)}"; RUN="$KIT/.run"; mkdir -p "$RUN"
start_db() {
  kill $(lsof -t -i:54321) $(lsof -t -i:54323) 2>/dev/null; sleep 2
  rm -rf "$RUN/storage-files" "$RUN/mailbox.log" "$RUN/emails.log" "$RUN/razorpay.log"
  (cd "$KIT" && LOG_REQ=1 setsid -f node start.mjs "$APP" --fresh --samples > "$RUN/gateway.log" 2>&1 < /dev/null)
  for i in $(seq 1 90); do grep -q "ready" "$RUN/gateway.log" 2>/dev/null && return; sleep 1; done
  echo "local database didn't start — see $RUN/gateway.log"; exit 1
}
start_app() { # $1 = extra env (e.g. STORE_CACHE_SECONDS=0)
  for p in $(ps aux | grep -E "next-server|next dev" | grep -v grep | awk '{print $2}'); do kill $p 2>/dev/null; done; sleep 2
  (cd "$APP" && env $1 NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_localtest \
    NEXT_PUBLIC_SITE_URL=http://localhost:3200 NEXT_TELEMETRY_DISABLED=1 SUPABASE_SECRET_KEY=sb_secret_localtest \
    RAZORPAY_KEY_ID=rzp_test_local RAZORPAY_KEY_SECRET=local_test_secret RAZORPAY_WEBHOOK_SECRET=local_webhook_secret \
    RAZORPAY_API_BASE=http://localhost:54321/razorpay RESEND_API_KEY=re_test_local EMAIL_FROM="Sandhya Test <orders@example.test>" \
    EMAIL_API_BASE=http://localhost:54321/email setsid -f npx next dev --turbopack -p 3200 > "$RUN/app.log" 2>&1 < /dev/null)
  for i in $(seq 1 120); do curl -s -o /dev/null localhost:3200 && break; sleep 1; done
}
# Most suites change the database directly, so they run with the storefront cache off.
start_app STORE_CACHE_SECONDS=0
status=0
for t in e2e-auth e2e-categories e2e-products e2e-stock-csv e2e-shopping e2e-new-product-photos e2e-checkout e2e-growth e2e-content; do
  echo; echo "=== $t"; start_db
  out=$(cd "$KIT" && python3 "$t.py" 2>&1); echo "$out" | grep -E "^(PASS|FAIL)|passed|Error"
  echo "$out" | grep -q " 0 failed" || status=1
done

# The speed cache itself, with caching on (as in real use).
echo; echo "=== e2e-cache"; start_db; start_app ""
out=$(cd "$KIT" && python3 e2e-cache.py 2>&1); echo "$out" | grep -E "^(PASS|FAIL)|passed|Error"
echo "$out" | grep -q " 0 failed" || status=1

echo; [ $status -eq 0 ] && echo "ALL BROWSER TESTS PASSED" || echo "SOME BROWSER TESTS FAILED"
exit $status
