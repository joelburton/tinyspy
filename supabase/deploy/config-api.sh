#!/usr/bin/env bash
# Step 3 — PostgREST config: exposed schemas, search path, max rows.
#
# PATCH /v1/projects/{ref}/postgrest. Server-side this also triggers a
# schema-cache reload, exactly like hitting Save on the dashboard's API
# settings page. Idempotent, and worth re-running on its own whenever a
# game is added: an unexposed schema fails EVERY request with PGRST106.
#
# MAX_ROWS must match supabase/config.toml — this step is what keeps
# the hosted setting in sync with the local one (they're separate
# settings; see docs/supabase.md → the max_rows trap).

. "$(dirname "$0")/env.sh"
require_project

say "3. Configuring PostgREST (schemas, search path, max_rows=${MAX_ROWS})"
announce_target
api -X PATCH "https://api.supabase.com/v1/projects/${PROJECT_REF}/postgrest" \
  -d "$(jq -n --arg s "$EXPOSED_SCHEMAS" --arg p "$EXTRA_SEARCH_PATH" \
        --argjson m "$MAX_ROWS" \
        '{db_schema: $s, db_extra_search_path: $p, max_rows: $m}')" >/dev/null
echo "    exposed: ${EXPOSED_SCHEMAS}"
