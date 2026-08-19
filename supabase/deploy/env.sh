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
# All credentials live in deploy.secrets.sh (GITIGNORED).
# Nothing secret is ever written into this file or the Makefile.
SECRETS_FILE="deploy.secrets.sh"
if [[ ! -f "$SECRETS_FILE" ]]; then
  echo "ERROR: $SECRETS_FILE not found (it carries your credentials)." >&2
  echo "       cp deploy.secrets.example.sh $SECRETS_FILE" >&2
  echo "       then fill it in. See docs/cheatsheet.md → gmake." >&2
  exit 1
fi
# The secrets file is hand-created, so nothing has ever chmodded it — unlike
# .deploy-credentials.cache, which save_credentials() writes at 600. It carries
# the Supabase PAT plus the Resend and Anthropic keys, so a default-umask 644
# leaves all three readable by anyone with an account on the machine. Tighten
# it rather than just complaining: the only reason it's ever loose is that
# nobody thought about it.
_perm=$(stat -f '%Lp' "$SECRETS_FILE" 2>/dev/null || stat -c '%a' "$SECRETS_FILE" 2>/dev/null || echo "")
if [[ -n "$_perm" && "$_perm" != "600" && "$_perm" != "400" ]]; then
  echo "NOTE: $SECRETS_FILE was mode $_perm — tightening to 600 (it holds your PAT)." >&2
  chmod 600 "$SECRETS_FILE" 2>/dev/null ||     echo "WARNING: couldn't chmod $SECRETS_FILE; it stays world-readable." >&2
fi

# The connection string must come from the secrets file or be derived below —
# never from whatever the caller's shell happens to export. A stray
# `export SUPABASE_DB_URL=…` (a leftover from manual psql work) would
# otherwise silently redirect every ENV=prod write to that database while the
# stamps and announcements claim prod. Discard it BEFORE the secrets file
# loads, so a value pinned there still wins. (audit-make.sh check 6 pins this.)
if [[ -n "${SUPABASE_DB_URL:-}" ]]; then
  echo "NOTE: ignoring SUPABASE_DB_URL from the environment — pin it in $SECRETS_FILE instead." >&2
  unset SUPABASE_DB_URL
fi

# shellcheck disable=SC1090
source "$SECRETS_FILE"

# ── required tooling ────────────────────────────────────────────
# Checked here rather than per-step: every step that touches the
# Management API needs jq, and every data step needs psql, so a
# missing one should fail before anything starts.
for _tool in jq psql curl pg_isready; do
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
EXPOSED_SCHEMAS="public,graphql_public,common,codenamesduet,psychicnum,connections,spellingbee,wordwheel,bananagrams,waffle,wordle,stackdown,scrabble,boggle,crosswords,wordiply,strands,letterboxed,setgame"

# Not strictly needed (every common.* reference in RLS and RPCs is
# fully qualified) but matching local keeps behavior identical.
EXTRA_SEARCH_PATH="common,public,extensions"

# PostgREST row cap — MUST match max_rows in supabase/config.toml.
# The hosted value is a separate setting; config-api.sh is what keeps
# the two in sync (docs/supabase.md → the max_rows trap).
MAX_ROWS=10000

# ── credentials CACHE (resume across partial runs) ───────────────
# Where project-create.sh stashes what it GENERATED — a new project's
# random DB password and its fetched API keys exist nowhere else the
# second they're made — so a later step, or a re-run after a failure,
# picks them up instead of creating a second project.
#
# The leading dot and the word "cache" are the contract: nobody edits
# this, and deleting it loses nothing that deploy.secrets.sh (the
# durable, hand-edited file, which WINS on every field it sets) or a
# refetch can't supply. The one exception is a password you never
# copied out — see the DB_PASSWORD note in deploy.secrets.example.sh.
# Gitignored by name.
CREDENTIALS_FILE=".deploy-credentials.cache"

# Values typed into the secrets file win over the saved ones; the
# saved file only fills what the user left blank or placeholdered.
if [[ -f "$CREDENTIALS_FILE" ]]; then
  _user_PROJECT_REF="${PROJECT_REF:-}"
  _user_DB_PASSWORD="${DB_PASSWORD:-}"
  _user_SERVICE_ROLE="${SUPABASE_SERVICE_ROLE_KEY:-}"
  _user_PUBLISHABLE="${SUPABASE_PUBLISHABLE_KEY:-}"
  # shellcheck disable=SC1090
  source "$CREDENTIALS_FILE"
  # Written as `if` blocks, not `[[ … ]] && assign`. Under `set -e` that idiom
  # is fine mid-script but returns 1 when the test fails — so the day one of
  # them ends up last in a function or in this file, the sourced prelude exits
  # non-zero and every deploy target dies for no visible reason. Don't
  # reintroduce the short form.
  if [[ "$_user_PROJECT_REF" != *"REPLACE-WITH"* && -n "$_user_PROJECT_REF" ]]; then PROJECT_REF="$_user_PROJECT_REF"; fi
  if [[ -n "$_user_DB_PASSWORD"  ]]; then DB_PASSWORD="$_user_DB_PASSWORD"; fi
  if [[ -n "$_user_SERVICE_ROLE" ]]; then SUPABASE_SERVICE_ROLE_KEY="$_user_SERVICE_ROLE"; fi
  if [[ -n "$_user_PUBLISHABLE"  ]]; then SUPABASE_PUBLISHABLE_KEY="$_user_PUBLISHABLE"; fi
fi

# Defaults so `set -u` can't trip on an optional field.
PROJECT_REF="${PROJECT_REF:-}"
DB_PASSWORD="${DB_PASSWORD:-}"
SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-}"
SUPABASE_PUBLISHABLE_KEY="${SUPABASE_PUBLISHABLE_KEY:-}"
SUPABASE_DB_URL="${SUPABASE_DB_URL:-}"

# ── helpers ─────────────────────────────────────────────────────

# Authenticated Management API call. The PAT rides a header FILE (process
# substitution — curl's `-H @file` form), not argv: argv is readable by any
# local process via ps for the duration of the call. Callers with a payload
# pipe it in with `-d @- <<< "$payload"` for the same reason — the create
# payload carries the DB password and the auth config carries the Resend key.
api() {
  curl --fail --silent --show-error \
    -H @<(printf 'Authorization: Bearer %s\n' "$PERSONAL_ACCESS_TOKEN") \
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
# GENERATED CACHE — written by supabase/deploy/env.sh, do not edit.
# Auto-loaded on the next run so a half-finished deploy can resume.
# To change any of this, edit deploy.secrets.sh instead: it wins over
# every field here. Safe to delete. NEVER commit (gitignored).

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
# The anon key is exported too, for the same reason the service-role one is:
# a child process can't see a plain shell variable. `db-add-user` needs it —
# it signs in AS the new player to call claim_username, and that call must
# carry the anon key rather than the service-role one, so a dropped
# Authorization header degrades to "anonymous", never to "superuser".
export SUPABASE_PUBLISHABLE_KEY
export SUPABASE_DB_PASSWORD="$DB_PASSWORD"

# Fetch whichever API keys we're missing for an EXISTING project.
# Cheap (one round-trip), idempotent, and every step that talks to
# PostgREST needs the service-role key.
fetch_api_keys() {
  require_project
  if [[ -n "$SUPABASE_SERVICE_ROLE_KEY" && -n "$SUPABASE_PUBLISHABLE_KEY" ]]; then return; fi
  local resp
  resp=$(api "https://api.supabase.com/v1/projects/${PROJECT_REF}/api-keys")
  if [[ -z "$SUPABASE_SERVICE_ROLE_KEY" ]]; then
    SUPABASE_SERVICE_ROLE_KEY=$(jq -r '.[] | select(.name == "service_role") | .api_key' <<< "$resp")
  fi
  if [[ -z "$SUPABASE_PUBLISHABLE_KEY" ]]; then
    SUPABASE_PUBLISHABLE_KEY=$(jq -r '.[] | select(.name == "anon") | .api_key' <<< "$resp")
  fi
  if [[ -z "$SUPABASE_SERVICE_ROLE_KEY" || "$SUPABASE_SERVICE_ROLE_KEY" == "null" ]]; then
    echo "ERROR: couldn't fetch the service_role key for ${PROJECT_REF}." >&2
    exit 1
  fi
  export SUPABASE_SERVICE_ROLE_KEY
  save_credentials
}

# ── reaching the hosted database ────────────────────────────────
# There are two doors into the same Postgres, and which one works
# depends on the NETWORK you are sitting on:
#
#   direct  db.<ref>.supabase.co   — IPv6 ONLY. Supabase moved direct
#           connections off IPv4; a network without working IPv6 can't
#           resolve it to anything usable, and getaddrinfo reports
#           "nodename nor servname provided" — which reads like a DNS
#           outage and is really "no usable address family".
#   pooler  aws-N-<region>.pooler.supabase.com — has IPv4. Same database,
#           reached through Supavisor.
#
# Home networks with ISP IPv6 take the direct door; café and hotel wifi
# usually can't. Rather than make that your problem, `auto` (the default)
# probes and picks. Force one with DB_ROUTE on the gmake command line:
#
#   gmake db-psql ENV=prod DB_ROUTE=pooler
#
# Both doors are the same database, so a wrong guess here can't send a
# write somewhere unexpected — which is why this knob is allowed to read
# the environment where SUPABASE_DB_URL deliberately isn't.
DB_ROUTE="${DB_ROUTE:-auto}"
DB_ROUTE_USED=""

# Can we open a TCP connection to the direct host?
#
# A PROBE rather than a check for a global IPv6 address, because the
# address is not the question: café wifi that hands out IPv6 which then
# routes nowhere passes an address check and hangs on the real connection.
# ~0.3s either way, against prod targets that already spend a round trip
# fetching API keys.
#
# pg_isready exit codes: 0 accepting, 1 rejecting (a server IS there —
# paused, restarting, too many connections), 2 no response, 3 bad params.
# Only 2 and 3 mean "this door isn't reachable"; a rejecting server is a
# problem the pooler would not fix and must not be papered over with a
# silent reroute.
direct_reachable() {
  pg_isready -h "db.${PROJECT_REF}.supabase.co" -p 5432 -t 3 >/dev/null 2>&1
  local rc=$?
  [[ $rc -eq 0 || $rc -eq 1 ]]
}

# The SESSION-pooler connection string, discovered rather than guessed.
#
# Both halves have to come from the API: the host carries a region AND a
# cluster number (`aws-1-us-west-1`, where `aws-0-us-west-1` also resolves
# and rejects the tenant with a baffling error), and the pooler's user is
# `postgres.<ref>`, not `postgres`.
#
# THE PORT IS OURS, NOT THE API'S. That endpoint reports 6543 — the
# TRANSACTION pooler, which has no session state and would break pg_dump,
# pg_restore and anything holding an advisory lock. Session mode is the
# same host on 5432, and that is what db-backup and db-restore need.
pooler_db_url() {
  require_project
  local cfg host user db enc
  cfg=$(api "https://api.supabase.com/v1/projects/${PROJECT_REF}/config/database/pooler") || {
    echo "ERROR: couldn't fetch the pooler configuration for ${PROJECT_REF}." >&2
    echo "       The direct host is unreachable from this network, so there is" >&2
    echo "       no other way in. Check the Management API token." >&2
    exit 1
  }
  host=$(jq -r 'map(select(.database_type == "PRIMARY")) | .[0].db_host // empty' <<< "$cfg")
  user=$(jq -r 'map(select(.database_type == "PRIMARY")) | .[0].db_user // empty' <<< "$cfg")
  db=$(jq -r   'map(select(.database_type == "PRIMARY")) | .[0].db_name // empty' <<< "$cfg")
  if [[ -z "$host" || -z "$user" || -z "$db" ]]; then
    echo "ERROR: the pooler configuration for ${PROJECT_REF} named no PRIMARY host." >&2
    exit 1
  fi
  enc=$(jq -rn --arg p "$DB_PASSWORD" '$p|@uri')
  printf 'postgresql://%s:%s@%s:5432/%s' "$user" "$enc" "$host" "$db"
}

# The psql connection string the bulk loaders and db-sql use, built from
# the DB password unless the secrets file pinned one. A pinned value WINS
# and is never probed — pinning is a deliberate act, and second-guessing it
# would make the one escape hatch unreliable.
#
# The password is URL-encoded so a special character can't break the URI.
# It is NOT recoverable for an existing project — hashed, and the dashboard
# reveal is one-shot — so it is the one field you must carry yourself.
derive_db_url() {
  require_project
  if [[ -n "$SUPABASE_DB_URL" ]]; then
    DB_ROUTE_USED="pinned in $SECRETS_FILE"
    export SUPABASE_DB_URL
    return
  fi
  if [[ -z "$DB_PASSWORD" ]]; then
    echo "ERROR: DB_PASSWORD is required to reach the hosted database." >&2
    echo "       Project Settings → Database → Reset database password" >&2
    echo "       (one-shot reveal), then set it in $SECRETS_FILE." >&2
    exit 1
  fi
  local enc direct
  enc=$(jq -rn --arg p "$DB_PASSWORD" '$p|@uri')
  direct="postgresql://postgres:${enc}@db.${PROJECT_REF}.supabase.co:5432/postgres"
  case "$DB_ROUTE" in
    direct) SUPABASE_DB_URL="$direct";           DB_ROUTE_USED="direct (forced)" ;;
    pooler) SUPABASE_DB_URL=$(pooler_db_url);    DB_ROUTE_USED="session pooler (forced)" ;;
    auto)
      if direct_reachable; then
        SUPABASE_DB_URL="$direct";               DB_ROUTE_USED="direct"
      else
        SUPABASE_DB_URL=$(pooler_db_url)
        DB_ROUTE_USED="session pooler (direct host unreachable — no IPv6 route?)"
      fi ;;
    *)
      echo "ERROR: DB_ROUTE must be auto, direct or pooler (got '$DB_ROUTE')." >&2
      exit 1 ;;
  esac
  export SUPABASE_DB_URL
}

# Announce the target before any step writes anything — the one
# habit that keeps a partial deploy from hitting the wrong database.
#
# The ROUTE is announced too, because the two doors have different failure
# modes and "which one am I on" should never need working out from a
# hostname you half-read.
announce_target() {
  echo "    project : ${PROJECT_REF}"
  if [[ -n "$SUPABASE_DB_URL" ]]; then echo "    database: $(mask "$SUPABASE_DB_URL")"; fi
  if [[ -n "$DB_ROUTE_USED" ]]; then echo "    route   : ${DB_ROUTE_USED}"; fi
}
