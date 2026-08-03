#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════
# Sourced prelude for every hosted-deploy step.
# ════════════════════════════════════════════════════════════════
# This file is the reason the deploy steps became individually
# runnable. They used to share one 762-line script's preamble —
# flag parsing, secrets sourcing, project discovery, derived
# connection strings — and that preamble, not the steps, was what
# made "just re-push the functions" impossible. It lives here now,
# and each step sources it.
#
#   . supabase/deploy/env.sh          # discovery only; never mutates a project
#
# Provides, after sourcing:
#   PROJECT_REF SUPABASE_URL SUPABASE_DB_URL SUPABASE_SERVICE_ROLE_KEY
#   SUPABASE_PUBLISHABLE_KEY SUPABASE_ACCESS_TOKEN DB_PASSWORD
#   EXPOSED_SCHEMAS EXTRA_SEARCH_PATH MAX_ROWS
#   api()  say()  mask()  require_project()  save_credentials()
#
# It is READ-ONLY with respect to the hosted project: it discovers
# and derives, and will fetch missing API keys, but it never creates
# or configures anything. Creation is `project-create.sh` (a target
# you run deliberately), so sourcing this can't cost money.
#
# Everything is idempotent and safe to source repeatedly — make
# runs it once per recipe.

set -euo pipefail

# ── secrets ─────────────────────────────────────────────────────
# All credentials live in import-to-hosted.secrets.sh (GITIGNORED).
# Nothing secret is ever written into this file or the Makefile.
SECRETS_FILE="import-to-hosted.secrets.sh"
if [[ ! -f "$SECRETS_FILE" ]]; then
  echo "ERROR: $SECRETS_FILE not found (it carries your credentials)." >&2
  echo "       cp import-to-hosted.secrets.example.sh $SECRETS_FILE" >&2
  echo "       then fill it in. See docs/cheatsheet.md → Deploying." >&2
  exit 1
fi
# shellcheck disable=SC1090
source "$SECRETS_FILE"

# ── required tooling ────────────────────────────────────────────
# Checked here rather than per-step: every step that touches the
# Management API needs jq, and every data step needs psql, so a
# missing one should fail before anything starts.
for _tool in jq psql curl; do
  if ! command -v "$_tool" >/dev/null 2>&1; then
    echo "ERROR: $_tool is required for hosted deploys." >&2
    echo "       macOS: brew install jq libpq   (add libpq's bin to PATH)" >&2
    exit 1
  fi
done

if [[ "${PERSONAL_ACCESS_TOKEN:-}" == *"REPLACE-WITH"* || -z "${PERSONAL_ACCESS_TOKEN:-}" ]]; then
  echo "ERROR: PERSONAL_ACCESS_TOKEN is unset or still a placeholder." >&2
  echo "       Get one at supabase.com/dashboard/account/tokens" >&2
  exit 1
fi
export SUPABASE_ACCESS_TOKEN="$PERSONAL_ACCESS_TOKEN"   # what the supabase CLI reads

# ── project config (not secret; mirrors supabase/config.toml) ────
# Schemas exposed through the Data API. `public` + `graphql_public`
# are Supabase defaults we keep so their features keep working.
# ADDING A GAME MEANS ADDING IT HERE — the same list config.toml
# carries locally, and src/schemaExposure.e2e.test.ts probes.
EXPOSED_SCHEMAS="public,graphql_public,common,codenamesduet,psychicnum,connections,spellingbee,wordwheel,bananagrams,waffle,wordle,stackdown,scrabble,boggle,crosswords,wordiply"

# Not strictly needed (every common.* reference in RLS and RPCs is
# fully qualified) but matching local keeps behavior identical.
EXTRA_SEARCH_PATH="common,public,extensions"

# PostgREST row cap — MUST match max_rows in supabase/config.toml.
# The hosted value is a separate setting; config-api.sh is what keeps
# the two in sync (docs/supabase.md → the max_rows trap).
MAX_ROWS=10000

# ── credentials file (resume across partial runs) ────────────────
# Where project-create.sh stashes what it generated, so a later step
# — or a re-run after a failure — picks up the ref, password and keys
# without re-creating anything. Gitignored via *.local.
CREDENTIALS_FILE="hosted-credentials.local"

# Values typed into the secrets file win over the saved ones; the
# saved file only fills what the user left blank or placeholdered.
if [[ -f "$CREDENTIALS_FILE" ]]; then
  _user_PROJECT_REF="${PROJECT_REF:-}"
  _user_DB_PASSWORD="${DB_PASSWORD:-}"
  _user_SERVICE_ROLE="${SUPABASE_SERVICE_ROLE_KEY:-}"
  _user_PUBLISHABLE="${SUPABASE_PUBLISHABLE_KEY:-}"
  # shellcheck disable=SC1090
  source "$CREDENTIALS_FILE"
  [[ "$_user_PROJECT_REF" != *"REPLACE-WITH"* && -n "$_user_PROJECT_REF" ]] && PROJECT_REF="$_user_PROJECT_REF"
  [[ -n "$_user_DB_PASSWORD"  ]] && DB_PASSWORD="$_user_DB_PASSWORD"
  [[ -n "$_user_SERVICE_ROLE" ]] && SUPABASE_SERVICE_ROLE_KEY="$_user_SERVICE_ROLE"
  [[ -n "$_user_PUBLISHABLE"  ]] && SUPABASE_PUBLISHABLE_KEY="$_user_PUBLISHABLE"
fi

# Defaults so `set -u` can't trip on an optional field.
PROJECT_REF="${PROJECT_REF:-}"
DB_PASSWORD="${DB_PASSWORD:-}"
SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-}"
SUPABASE_PUBLISHABLE_KEY="${SUPABASE_PUBLISHABLE_KEY:-}"
SUPABASE_DB_URL="${SUPABASE_DB_URL:-}"

# ── helpers ─────────────────────────────────────────────────────

# Authenticated Management API call.
api() {
  curl --fail --silent --show-error \
    -H "Authorization: Bearer ${PERSONAL_ACCESS_TOKEN}" \
    -H "Content-Type: application/json" \
    "$@"
}

# Step banner. Every step announces itself the same way, so a
# partial run reads like a slice of the full one.
say() { echo "═══ $* ═══"; }

# Redact a password out of a connection string before echoing it.
mask() { sed -E 's#:[^:@/]*@#:****@#g' <<< "$1"; }

# Persist what we know. Called by project-create.sh and by any step
# that discovers a key, so a crash mid-deploy still leaves a clean
# resume point. 600 because the service-role key is god-mode.
save_credentials() {
  cat > "$CREDENTIALS_FILE" <<EOF
# Hosted Supabase credentials, written by supabase/deploy/env.sh.
# Auto-loaded on the next run. Edit by hand to point at a different
# project. NEVER commit (gitignored via *.local).

PROJECT_REF="${PROJECT_REF}"
DB_PASSWORD="${DB_PASSWORD}"
SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY}"
SUPABASE_PUBLISHABLE_KEY="${SUPABASE_PUBLISHABLE_KEY}"
SUPABASE_URL="https://${PROJECT_REF}.supabase.co"
EOF
  chmod 600 "$CREDENTIALS_FILE"
}

# Every step except project-create calls this first.
require_project() {
  if [[ -z "$PROJECT_REF" || "$PROJECT_REF" == *"REPLACE-WITH"* ]]; then
    echo "ERROR: no PROJECT_REF. Either set it in $SECRETS_FILE (an existing" >&2
    echo "       project) or run \`gmake project-create\` to make a new one." >&2
    exit 1
  fi
}

# ── derived values ──────────────────────────────────────────────
# Only meaningful once a project exists; harmless placeholders
# otherwise, since require_project() gates every user of them.
SUPABASE_URL="https://${PROJECT_REF}.supabase.co"
export SUPABASE_URL
export SUPABASE_SERVICE_ROLE_KEY
export SUPABASE_DB_PASSWORD="$DB_PASSWORD"

# Fetch whichever API keys we're missing for an EXISTING project.
# Cheap (one round-trip), idempotent, and every step that talks to
# PostgREST needs the service-role key.
fetch_api_keys() {
  require_project
  if [[ -n "$SUPABASE_SERVICE_ROLE_KEY" && -n "$SUPABASE_PUBLISHABLE_KEY" ]]; then return; fi
  local resp
  resp=$(api "https://api.supabase.com/v1/projects/${PROJECT_REF}/api-keys")
  [[ -z "$SUPABASE_SERVICE_ROLE_KEY" ]] && \
    SUPABASE_SERVICE_ROLE_KEY=$(jq -r '.[] | select(.name == "service_role") | .api_key' <<< "$resp")
  [[ -z "$SUPABASE_PUBLISHABLE_KEY" ]] && \
    SUPABASE_PUBLISHABLE_KEY=$(jq -r '.[] | select(.name == "anon") | .api_key' <<< "$resp")
  if [[ -z "$SUPABASE_SERVICE_ROLE_KEY" || "$SUPABASE_SERVICE_ROLE_KEY" == "null" ]]; then
    echo "ERROR: couldn't fetch the service_role key for ${PROJECT_REF}." >&2
    exit 1
  fi
  export SUPABASE_SERVICE_ROLE_KEY
  save_credentials
}

# The psql connection string the bulk loaders and sql:apply use.
# DIRECT connection, built from the DB password unless the secrets
# file pinned one (use the Session pooler string there if the direct
# host is unreachable on your network). The password is URL-encoded
# so a special character can't break the URI.
#
# The DB password is NOT recoverable for an existing project — it's
# hashed, and the dashboard reveal is one-shot — so this is the one
# field you must carry yourself.
derive_db_url() {
  require_project
  if [[ -z "$SUPABASE_DB_URL" ]]; then
    if [[ -z "$DB_PASSWORD" ]]; then
      echo "ERROR: DB_PASSWORD is required to reach the hosted database." >&2
      echo "       Project Settings → Database → Reset database password" >&2
      echo "       (one-shot reveal), then set it in $SECRETS_FILE." >&2
      exit 1
    fi
    local enc
    enc=$(jq -rn --arg p "$DB_PASSWORD" '$p|@uri')
    SUPABASE_DB_URL="postgresql://postgres:${enc}@db.${PROJECT_REF}.supabase.co:5432/postgres"
  fi
  export SUPABASE_DB_URL
}

# Announce the target before any step writes anything — the one
# habit that keeps a partial deploy from hitting the wrong database.
announce_target() {
  echo "    project : ${PROJECT_REF}"
  [[ -n "$SUPABASE_DB_URL" ]] && echo "    database: $(mask "$SUPABASE_DB_URL")"
  return 0
}
