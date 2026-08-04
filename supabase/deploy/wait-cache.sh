#!/usr/bin/env bash
# Step 7 — wait for PostgREST's schema cache to catch up with config-api.
#
# The connections import goes through PostgREST; until the exposed-schemas
# change from config-api lands, it fails with PGRST106 "Invalid schema"
# (HTTP 406). The psql-COPY loaders — words, pangrams, stackdown — don't
# care. So this POLLS rather than sleeping a fixed 15s: probe the
# `connections` schema (the consumer that actually failed) every 2s until
# the API stops answering 406, up to WAIT_SECONDS (default 60).
#
# On timeout it WARNS and continues instead of failing: if the probe logic
# is ever wrong, a hard failure here would block deploys that were fine,
# and the import that follows produces its own clear error when the cache
# genuinely never reloaded.
#
# Its own target because when you're re-running just the data import
# against an already-configured project, you can skip it.

. "$(dirname "$0")/env.sh"
require_project
fetch_api_keys

MAX="${WAIT_SECONDS:-60}"
say "7. Waiting for the PostgREST schema cache (probing, max ${MAX}s)"

# Service-role key so grants/RLS can't confuse the answer: any response but
# 406 means the schema is exposed, which is all we're asking. The key rides
# a header file, not argv — same reason as api() in env.sh.
probe="${SUPABASE_URL}/rest/v1/puzzles?select=id&limit=1"
for ((elapsed = 0; elapsed < MAX; elapsed += 2)); do
  code=$(curl --silent --output /dev/null --write-out '%{http_code}' \
    -H @<(printf 'apikey: %s\nAuthorization: Bearer %s\n' \
          "$SUPABASE_SERVICE_ROLE_KEY" "$SUPABASE_SERVICE_ROLE_KEY") \
    -H "Accept-Profile: connections" "$probe" || echo 000)
  # 000 = no HTTP answer at all (DNS, TLS, refused) — keep waiting.
  if [[ "$code" != "406" && "$code" != "000" ]]; then
    echo "    schema exposed (HTTP ${code} after ~${elapsed}s)"
    exit 0
  fi
  sleep 2
done

echo "    WARNING: still not exposed after ${MAX}s — continuing anyway;" >&2
echo "    the connections import will fail with PGRST106 if the cache" >&2
echo "    truly never reloaded (re-run gmake project-config-api, then this)." >&2
