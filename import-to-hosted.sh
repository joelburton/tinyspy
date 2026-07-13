#!/usr/bin/env bash
#
# One-shot setup runner for a fresh hosted Supabase project.
#
# Secrets + per-deployment values live in import-to-hosted.secrets.sh
# (GITIGNORED); this script sources that file and carries none itself,
# so it is safe to commit. Create yours from the template:
#   cp import-to-hosted.secrets.example.sh import-to-hosted.secrets.sh
#   # then fill in import-to-hosted.secrets.sh
#
# What this script does, in order:
#   0. (if PROJECT_REF is unset) Create the hosted project via the
#      Management API — name "puzpuzpuz", region us-west-1, free
#      plan. Generates a DB password if none is provided, then
#      polls until ACTIVE_HEALTHY, then fetches the service_role
#      key from the API.
#   1. Link this local checkout to the hosted project.
#   2. Apply migrations — strategy chosen by a REQUIRED flag:
#        --destroy  WIPE the remote DB, then replay every migration
#                   from scratch (`db reset --linked`). Use after
#                   editing/squashing applied migrations; destroys ALL
#                   hosted data, auth accounts included.
#        --keep     push only the migrations the remote hasn't
#                   recorded yet (`db push`), preserving data.
#      Passing neither is a hard error — the two behaviors are too
#      different (one wipes everything) to guess a default.
#   3. PATCH the PostgREST config to add our schemas to the
#      "exposed schemas" allowlist + extra search path, and set
#      Max Rows to match local config.toml.
#   4. PATCH the auth config — Site URL + redirect allowlist +
#      Resend SMTP settings + magic-link email template with
#      both {{ .ConfirmationURL }} link AND {{ .Token }} code.
#   5. (optional) Set the ANTHROPIC_API_KEY edge function secret
#      so codenamesduet's clue suggester works.
#   6. supabase functions deploy  — push all edge functions.
#   7. Wait for PostgREST's schema-cache reload.
#   8. Run the data imports via `npm run import` (common.words master
#      list → spellingbee pangram seeds → wordwheel pangram seeds →
#      connections puzzles → stackdown boards).
#   9. (when DEPLOY_FE=true) Write .env.production.local with the
#      new project's URL + publishable key, then npm run build,
#      then netlify deploy -p -d dist.
#
# What this script does NOT do (do these yourself):
#   - Verify the SMTP sender domain in Resend (DNS records on
#     your domain registrar; one-time per domain). Without this
#     Resend won't deliver from your sender address.
#
# Required local tools:
#   - jq    (safe JSON-escape for the email template + URL-encode the
#           DB password). `brew install jq` / `apt install jq`.
#   - psql  (the spellingbee + definitions bulk loads use COPY over a
#           direct DB connection). `brew install libpq` (then add its
#           bin to PATH) / `apt install postgresql-client`.
#
# To use:
#   1. cp import-to-hosted.secrets.example.sh import-to-hosted.secrets.sh, then fill it in.
#   2. chmod +x import-to-hosted.sh   (first time only)
#   3. ./import-to-hosted.sh --destroy     (or --keep)
#
# Re-running is safe — every step is idempotent. (Caveat: --destroy
# wipes the remote DB on every run by design; --keep is additive.)

set -euo pipefail

# ════════════════════════════════════════════════════════════════
# Migration strategy — REQUIRED flag (--destroy | --keep)
# ════════════════════════════════════════════════════════════════
# Parsed first so we fail fast (before any project creation / API
# calls) if the caller didn't pick a strategy. The two modes differ
# enough — one wipes the entire remote DB — that there's no safe
# default; the flag must be explicit.

usage() {
  echo "Usage: ./import-to-hosted.sh (--destroy | --keep)" >&2
  echo >&2
  echo "  --destroy  WIPE the remote DB, then replay ALL migrations from" >&2
  echo "             scratch. Use after editing/squashing applied migrations." >&2
  echo "             Destroys all hosted data, auth accounts included." >&2
  echo "  --keep     Apply only new (unrecorded) migrations, preserving data." >&2
  echo "             Fails if an already-applied migration was edited." >&2
}

MIGRATION_MODE=""
for arg in "$@"; do
  case "$arg" in
    --destroy|--keep)
      if [[ -n "$MIGRATION_MODE" ]]; then
        echo "ERROR: pass exactly one of --destroy / --keep, not both." >&2
        usage
        exit 1
      fi
      MIGRATION_MODE="${arg#--}"   # "destroy" or "keep"
      ;;
    *)
      echo "ERROR: unknown argument '${arg}'." >&2
      usage
      exit 1
      ;;
  esac
done

if [[ -z "$MIGRATION_MODE" ]]; then
  echo "ERROR: you must specify a migration strategy: --destroy or --keep." >&2
  usage
  exit 1
fi

# ════════════════════════════════════════════════════════════════
# Secrets + per-deployment config (sourced; never inline here)
# ════════════════════════════════════════════════════════════════
# All secrets (PAT, service-role key, Anthropic/Resend keys) and
# per-deployment values (project ref, site URL, sender email) live in
# import-to-hosted.secrets.sh, which is GITIGNORED. Sourcing them keeps
# this script free of credentials and safe to commit. See
# import-to-hosted.secrets.example.sh for the field docs.

SECRETS_FILE="import-to-hosted.secrets.sh"
if [[ ! -f "$SECRETS_FILE" ]]; then
  echo "ERROR: $SECRETS_FILE not found (this carries your secrets)." >&2
  echo "       cp import-to-hosted.secrets.example.sh $SECRETS_FILE" >&2
  echo "       then fill in your values and re-run." >&2
  exit 1
fi
# shellcheck disable=SC1090
source "$SECRETS_FILE"

# Where step 0 stashes the auto-generated PROJECT_REF / DB_PASSWORD /
# service-role key so a re-run after a partial failure picks up where
# it left off. Gitignored via the *.local pattern.
CREDENTIALS_FILE="hosted-credentials.local"

# ════════════════════════════════════════════════════════════════
# Derived / config (no edit needed)
# ════════════════════════════════════════════════════════════════

SUPABASE_URL="https://${PROJECT_REF}.supabase.co"

# Schemas to expose via the Data API. `public` + `graphql_public`
# are Supabase defaults that we keep so other features that read
# from them don't break.
EXPOSED_SCHEMAS="public,graphql_public,common,codenamesduet,psychicnum,connections,spellingbee,wordwheel,bananagrams,waffle,wordle,stackdown,scrabble,boggle,crosswords,wordiply"

# Extra search path. Strictly speaking we don't NEED this (every
# common.* reference in our RLS and RPCs is fully qualified — see
# the deploy notes in the conversation), but matching local makes
# behavior identical across environments.
EXTRA_SEARCH_PATH="common,public,extensions"

# PostgREST row cap — MUST match max_rows in supabase/config.toml
# (see the rationale comment there: a backstop against missing-filter
# bugs, not a substitute for explicit .limit()s). The hosted value is
# a separate setting from the local config.toml one; setting it here
# is what keeps the two in sync.
MAX_ROWS=10000

# ════════════════════════════════════════════════════════════════
# Sanity check — refuse to run with placeholders in load-bearing
# fields. The Anthropic key is checked separately below as
# optional.
# ════════════════════════════════════════════════════════════════

# Only the PAT is required. Everything else is auto-discovered or
# optional with a clear "skipped" log message.
if [[ "$PERSONAL_ACCESS_TOKEN" == *"REPLACE-WITH"* ]]; then
  echo "ERROR: PERSONAL_ACCESS_TOKEN still has its REPLACE-WITH placeholder." >&2
  echo "       Get one at supabase.com/dashboard/account/tokens" >&2
  echo "       and set it in import-to-hosted.secrets.sh before running." >&2
  exit 1
fi

# jq is required for safe JSON assembly (auth payload + project
# creation response parsing) — fail fast if missing.
if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR: jq is required (JSON escaping + parsing)." >&2
  echo "       Install with 'brew install jq' or 'apt install jq', then re-run." >&2
  exit 1
fi

# psql is required for the COPY-based bulk loads (step 8a + 8c).
if ! command -v psql >/dev/null 2>&1; then
  echo "ERROR: psql is required (spellingbee + definitions load via COPY)." >&2
  echo "       Install with 'brew install libpq' (add its bin to PATH)" >&2
  echo "       or 'apt install postgresql-client', then re-run." >&2
  exit 1
fi

export SUPABASE_ACCESS_TOKEN="$PERSONAL_ACCESS_TOKEN"   # for supabase CLI

# ════════════════════════════════════════════════════════════════
# Auto-load credentials file (if present) — lets a re-run after a
# partial failure pick up the project ref + DB password + service-
# role key that step 0 generated last time.
# ════════════════════════════════════════════════════════════════
# Strategy: stash whatever the user typed at the top, source the
# file, then restore any user-typed values that aren't placeholders
# / blank. The file only wins for fields the user left as the
# default.

if [[ -f "$CREDENTIALS_FILE" ]]; then
  echo "Found ${CREDENTIALS_FILE} — loading saved credentials."
  _user_PROJECT_REF="$PROJECT_REF"
  _user_DB_PASSWORD="$DB_PASSWORD"
  _user_SERVICE_ROLE="$SUPABASE_SERVICE_ROLE_KEY"
  _user_PUBLISHABLE="$SUPABASE_PUBLISHABLE_KEY"

  # shellcheck disable=SC1090
  source "$CREDENTIALS_FILE"

  [[ "$_user_PROJECT_REF" != *"REPLACE-WITH"* ]] && PROJECT_REF="$_user_PROJECT_REF"
  [[ -n "$_user_DB_PASSWORD"     ]] && DB_PASSWORD="$_user_DB_PASSWORD"
  [[ -n "$_user_SERVICE_ROLE"    ]] && SUPABASE_SERVICE_ROLE_KEY="$_user_SERVICE_ROLE"
  [[ -n "$_user_PUBLISHABLE"     ]] && SUPABASE_PUBLISHABLE_KEY="$_user_PUBLISHABLE"
  echo
fi

# Helper: write PROJECT_REF, DB_PASSWORD, both API keys, and the
# derived URL to the credentials file. Called immediately after
# step 0 (so a partial-failure mid-script preserves them) and
# again at the end of the run. Restrictive file mode (600) since
# the service-role key is god-mode.
save_credentials() {
  cat > "$CREDENTIALS_FILE" <<EOF
# Hosted Supabase credentials saved by import-to-hosted.sh
# Auto-loaded on the next run. Edit by hand if you need to point
# at a different project. NEVER commit (gitignored via *.local).

PROJECT_REF="${PROJECT_REF}"
DB_PASSWORD="${DB_PASSWORD}"
SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY}"
SUPABASE_PUBLISHABLE_KEY="${SUPABASE_PUBLISHABLE_KEY}"
SUPABASE_URL="https://${PROJECT_REF}.supabase.co"
EOF
  chmod 600 "$CREDENTIALS_FILE"
}

# ════════════════════════════════════════════════════════════════
# 0. Create the hosted project (if PROJECT_REF isn't filled)
# ════════════════════════════════════════════════════════════════
# When the user wants a fresh project, this section:
#   - Discovers the org id (or uses the user-supplied one).
#   - Generates a strong random DB password if blank.
#   - POSTs /v1/projects to create.
#   - Polls /v1/projects/{ref} until status is ACTIVE_HEALTHY
#     (takes ~60-120s in practice).
#   - GETs /v1/projects/{ref}/api-keys and extracts the
#     service_role key.
#
# When PROJECT_REF is already filled (re-running on an existing
# project): the whole block is skipped. SUPABASE_SERVICE_ROLE_KEY
# must either be provided or will be fetched in a follow-up
# block below.

api() {
  curl --fail --silent --show-error \
    -H "Authorization: Bearer ${PERSONAL_ACCESS_TOKEN}" \
    -H "Content-Type: application/json" \
    "$@"
}

if [[ "$PROJECT_REF" == *"REPLACE-WITH"* ]]; then
  echo "═══ 0. Creating new Supabase project ═══"

  # Discover org id if not provided. GET /v1/organizations returns
  # an array of {id, name, ...}; first one is the typical default.
  if [[ -z "$ORG_ID" ]]; then
    ORG_ID=$(api "https://api.supabase.com/v1/organizations" | jq -r '.[0].id')
    if [[ -z "$ORG_ID" || "$ORG_ID" == "null" ]]; then
      echo "ERROR: couldn't auto-discover an organization id." >&2
      echo "       Set ORG_ID explicitly at the top of this script." >&2
      exit 1
    fi
    echo "       Using org_id=${ORG_ID} (first org returned)"
  fi

  # Generate DB password if not provided. 32 hex chars from
  # /dev/urandom — strong, easy to log, no shell-quote issues.
  if [[ -z "$DB_PASSWORD" ]]; then
    DB_PASSWORD=$(openssl rand -hex 16)
    echo "       Generated DB password (saved below at the end of the run)"
  fi

  # POST /v1/projects. Body: {name, organization_id, db_pass,
  # region, plan}. Response includes the project id (= our ref).
  create_payload=$(jq -n \
    --arg name "$PROJECT_NAME" \
    --arg org_id "$ORG_ID" \
    --arg db_pass "$DB_PASSWORD" \
    --arg region "$PROJECT_REGION" \
    --arg plan "$PROJECT_PLAN" \
    '{
      name: $name,
      organization_id: $org_id,
      db_pass: $db_pass,
      region: $region,
      plan: $plan
    }')

  echo "       Submitting create request (name=${PROJECT_NAME}, region=${PROJECT_REGION})..."
  create_response=$(api -X POST "https://api.supabase.com/v1/projects" \
    -d "$create_payload")
  PROJECT_REF=$(echo "$create_response" | jq -r '.id')
  if [[ -z "$PROJECT_REF" || "$PROJECT_REF" == "null" ]]; then
    echo "ERROR: create_project response didn't contain an id." >&2
    echo "$create_response" >&2
    exit 1
  fi
  echo "       Created project_ref=${PROJECT_REF}"

  # Poll for ACTIVE_HEALTHY. Other transient statuses:
  # COMING_UP, CREATING, ACTIVE_HEALTHY. Worst case ~5 minutes;
  # most projects come up within 60-90s.
  echo "       Waiting for project to become ACTIVE_HEALTHY..."
  for i in $(seq 1 30); do
    sleep 10
    status=$(api "https://api.supabase.com/v1/projects/${PROJECT_REF}" \
      | jq -r '.status // "UNKNOWN"')
    echo "         [${i}/30] status=${status}"
    if [[ "$status" == "ACTIVE_HEALTHY" ]]; then
      break
    fi
  done
  if [[ "$status" != "ACTIVE_HEALTHY" ]]; then
    echo "ERROR: project didn't become ACTIVE_HEALTHY within 5 minutes." >&2
    echo "       Final status: ${status}. Check the dashboard." >&2
    exit 1
  fi

  # Fetch both API keys in one round-trip. /v1/projects/{ref}/api-keys
  # returns an array of {name, api_key}; we extract the "service_role"
  # and "anon" entries. (Supabase still calls the public key "anon"
  # at the API layer even though dashboards/SDKs have rebranded it
  # "publishable.")
  echo "       Fetching API keys..."
  _api_keys_response=$(api "https://api.supabase.com/v1/projects/${PROJECT_REF}/api-keys")
  SUPABASE_SERVICE_ROLE_KEY=$(echo "$_api_keys_response" \
    | jq -r '.[] | select(.name == "service_role") | .api_key')
  SUPABASE_PUBLISHABLE_KEY=$(echo "$_api_keys_response" \
    | jq -r '.[] | select(.name == "anon") | .api_key')
  if [[ -z "$SUPABASE_SERVICE_ROLE_KEY" || "$SUPABASE_SERVICE_ROLE_KEY" == "null" ]]; then
    echo "ERROR: couldn't extract service_role key from API response." >&2
    exit 1
  fi
  if [[ -z "$SUPABASE_PUBLISHABLE_KEY" || "$SUPABASE_PUBLISHABLE_KEY" == "null" ]]; then
    echo "ERROR: couldn't extract anon/publishable key from API response." >&2
    exit 1
  fi
  echo "       Both API keys retrieved."
else
  echo "═══ 0. Skipping project creation (PROJECT_REF=${PROJECT_REF}) ═══"

  # If reusing an existing project but any key is missing, fetch
  # whichever ones we don't have. Same endpoint either way.
  if [[ -z "$SUPABASE_SERVICE_ROLE_KEY" || -z "$SUPABASE_PUBLISHABLE_KEY" ]]; then
    echo "       Fetching missing API keys from existing project..."
    _api_keys_response=$(api "https://api.supabase.com/v1/projects/${PROJECT_REF}/api-keys")
    [[ -z "$SUPABASE_SERVICE_ROLE_KEY" ]] && SUPABASE_SERVICE_ROLE_KEY=$(echo "$_api_keys_response" \
      | jq -r '.[] | select(.name == "service_role") | .api_key')
    [[ -z "$SUPABASE_PUBLISHABLE_KEY" ]] && SUPABASE_PUBLISHABLE_KEY=$(echo "$_api_keys_response" \
      | jq -r '.[] | select(.name == "anon") | .api_key')
    if [[ -z "$SUPABASE_SERVICE_ROLE_KEY" || "$SUPABASE_SERVICE_ROLE_KEY" == "null" ]]; then
      echo "ERROR: couldn't fetch service_role key for project ${PROJECT_REF}." >&2
      exit 1
    fi
    if [[ -z "$SUPABASE_PUBLISHABLE_KEY" || "$SUPABASE_PUBLISHABLE_KEY" == "null" ]]; then
      echo "ERROR: couldn't fetch anon/publishable key for project ${PROJECT_REF}." >&2
      exit 1
    fi
  fi

  # DB password we genuinely cannot recover for an existing project
  # (it's hashed in the DB; the dashboard's "reveal" is one-shot).
  # The user must provide it if they want this script to push
  # migrations against an existing project.
  if [[ -z "$DB_PASSWORD" ]]; then
    echo "ERROR: DB_PASSWORD is required when reusing an existing project." >&2
    echo "       Get it from Project Settings → Database → Reset database password" >&2
    echo "       (one-shot reveal) and set it at the top of this script." >&2
    exit 1
  fi
fi

# Persist credentials before doing anything else that could fail.
# This means a script crash anywhere in steps 1-8 still leaves the
# credentials file behind for a clean re-run.
save_credentials
echo "       Credentials saved to ${CREDENTIALS_FILE}"
echo

# Now we have PROJECT_REF + SUPABASE_SERVICE_ROLE_KEY + DB_PASSWORD
# for sure. Compute the derived URL and export everything the CLI
# and import scripts read from env.
SUPABASE_URL="https://${PROJECT_REF}.supabase.co"
export SUPABASE_DB_PASSWORD="$DB_PASSWORD"
export SUPABASE_URL
export SUPABASE_SERVICE_ROLE_KEY

# psql connection string for the COPY-based bulk loaders (spellingbee
# dictionary + definitions). Auto-construct the DIRECT connection from
# the DB password unless the user pinned one above. The password is
# URL-encoded via jq (@uri) so a special character can't break the
# URI. If the direct host fails on your network, set SUPABASE_DB_URL
# at the top to the Session pooler string (see that field's comment).
if [[ -z "$SUPABASE_DB_URL" ]]; then
  _enc_pw=$(jq -rn --arg p "$DB_PASSWORD" '$p|@uri')
  SUPABASE_DB_URL="postgresql://postgres:${_enc_pw}@db.${PROJECT_REF}.supabase.co:5432/postgres"
fi
export SUPABASE_DB_URL

# ════════════════════════════════════════════════════════════════
# 1. Link the local checkout to the hosted project
# ════════════════════════════════════════════════════════════════
# Idempotent — re-running on an already-linked project either no-ops
# or relinks to the same ref.

echo "═══ 1. Linking checkout to project ${PROJECT_REF} ═══"
supabase link --project-ref "$PROJECT_REF"
echo

# ════════════════════════════════════════════════════════════════
# 2. Apply migrations (strategy chosen by --destroy / --keep)
# ════════════════════════════════════════════════════════════════
# --destroy: `db reset --linked` DROPS the remote database and
#   replays every local migration in order against a clean slate.
#   Use this whenever an already-applied migration was edited or
#   squashed (routine in alpha): the remote's recorded history drifts
#   from the files, and a plain push would leave stale schema and
#   fail (e.g. "column club_handle does not exist" when a later
#   backfill assumes a shape an edited baseline never produced on the
#   remote). This WIPES all hosted data — auth accounts included; the
#   friends re-authenticate and step 8 re-seeds the real data.
#     --yes      auto-answer the destructive prompt (global flag) so
#                the script stays non-interactive.
#     --no-seed  skip the no-op seed.sql; data comes from step 8.
#
# --keep: `db push` applies only migrations the remote hasn't
#   recorded, preserving existing data. Additive and safe — but it
#   fails on edited-migration drift (that's exactly what --destroy
#   fixes). The here-string "<<< y" sends a single confirmation; we
#   avoid `yes |` because under `set -o pipefail`, `yes` dying on
#   SIGPIPE after push exits would propagate as a pipeline failure
#   and kill the script right after the migrations succeeded.

echo "═══ 2. Applying migrations (mode: ${MIGRATION_MODE}) ═══"
if [[ "$MIGRATION_MODE" == "destroy" ]]; then
  supabase db reset --linked --yes --no-seed
else
  supabase db push --linked <<< y
fi
echo

# ════════════════════════════════════════════════════════════════
# 3. Configure PostgREST exposed schemas + search path + max rows
# ════════════════════════════════════════════════════════════════
# Management API: PATCH /v1/projects/{ref}/postgrest. Server-side
# triggers a PostgREST schema-cache reload — same as clicking Save
# in the dashboard's API settings page. Idempotent.

echo "═══ 3. Configuring PostgREST exposed schemas ═══"
curl --fail --silent --show-error \
  -X PATCH "https://api.supabase.com/v1/projects/${PROJECT_REF}/postgrest" \
  -H "Authorization: Bearer ${PERSONAL_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{
    \"db_schema\": \"${EXPOSED_SCHEMAS}\",
    \"db_extra_search_path\": \"${EXTRA_SEARCH_PATH}\",
    \"max_rows\": ${MAX_ROWS}
  }"
echo

# ════════════════════════════════════════════════════════════════
# 4. Configure auth — site URL + redirect allowlist + Resend SMTP
#    + magic-link email template
# ════════════════════════════════════════════════════════════════
# All-or-nothing gate: every auth placeholder must be filled. If
# any is still REPLACE-WITH, skip the whole step (and the dashboard
# UI for Authentication → URL Configuration / SMTP / Email
# Templates remains the fallback).
#
# Endpoint: PATCH /v1/projects/{ref}/config/auth
# Docs: https://supabase.com/docs/reference/api/v1-update-auth-service-config

auth_skip=0
for v in "$SITE_URL" "$RESEND_API_KEY" "$SMTP_SENDER_EMAIL"; do
  if [[ "$v" == *"REPLACE-WITH"* ]]; then
    auth_skip=1
    break
  fi
done

if (( auth_skip == 1 )); then
  echo "═══ 4. Skipping auth config (one or more placeholders unchanged) ═══"
  echo "       Configure SITE_URL / RESEND_API_KEY / SMTP_SENDER_EMAIL"
  echo "       in the dashboard or re-run with those fields filled."
else
  echo "═══ 4. Configuring auth (site URL, SMTP, email template) ═══"

  # The magic-link email body. Both the {{ .ConfirmationURL }}
  # link and the {{ .Token }} 6-digit code are surfaced so the
  # user can sign in cross-device (open the email on phone, paste
  # the code into the laptop sign-in form). Supabase substitutes
  # both tokens server-side when the email is rendered.
  #
  # Single-quoted multi-line literal — bash treats it as one
  # string with embedded newlines. The single quotes mean nothing
  # inside expands, which is exactly what we want for the
  # {{ }} template placeholders.
  magic_link_html='<h2>Sign in to PuzPuzPuz</h2>
<p>Click the link to sign in:</p>
<p><a href="{{ .ConfirmationURL }}">Sign in to PuzPuzPuz</a></p>
<p>Or enter this code on the sign-in page:</p>
<p style="font-size: 24px; font-family: monospace; letter-spacing: 4px;">{{ .Token }}</p>
<p style="color: #666; font-size: 12px;">
This code expires in 1 hour. If you did not request this, ignore the email.
</p>'

  # Build the JSON payload via jq so the HTML's quotes / braces /
  # newlines are safely escaped. `uri_allow_list` is comma-
  # separated and accepts wildcards — we add `$SITE_URL/*` so
  # deploy-preview URLs aren't rejected.
  #
  # **Both** the magic-link template AND the signup-confirmation
  # template are set. The confirmation template fires on first-
  # time sign-in (Supabase treats a magic-link signin against a
  # never-seen email as a signup); the magic-link template fires
  # on every subsequent signin. For a magic-link-only auth flow,
  # the two paths should read identical to the user, so we point
  # both at the same HTML and use the same subject.
  auth_payload=$(jq -n \
    --arg site_url "$SITE_URL" \
    --arg uri_allow_list "${SITE_URL},${SITE_URL}/*" \
    --arg smtp_admin_email "$SMTP_SENDER_EMAIL" \
    --arg smtp_pass "$RESEND_API_KEY" \
    --arg smtp_sender_name "$SMTP_SENDER_NAME" \
    --arg magic_template "$magic_link_html" \
    '{
      site_url: $site_url,
      uri_allow_list: $uri_allow_list,
      smtp_admin_email: $smtp_admin_email,
      smtp_host: "smtp.resend.com",
      smtp_port: "465",
      smtp_user: "resend",
      smtp_pass: $smtp_pass,
      smtp_sender_name: $smtp_sender_name,
      smtp_max_frequency: 60,
      mailer_subjects_magic_link:           "Sign in to PuzPuzPuz",
      mailer_templates_magic_link_content:  $magic_template,
      mailer_subjects_confirmation:          "Sign in to PuzPuzPuz",
      mailer_templates_confirmation_content: $magic_template
    }')

  curl --fail --silent --show-error \
    -X PATCH "https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth" \
    -H "Authorization: Bearer ${PERSONAL_ACCESS_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "$auth_payload" \
    >/dev/null
  echo "       Done. Site URL=${SITE_URL}; SMTP=smtp.resend.com (Resend)."
fi
echo

# ════════════════════════════════════════════════════════════════
# 5. (optional) Set ANTHROPIC_API_KEY edge function secret
# ════════════════════════════════════════════════════════════════

if [[ "$ANTHROPIC_API_KEY" == *"REPLACE-WITH"* ]]; then
  echo "═══ 5. Skipping ANTHROPIC_API_KEY (placeholder unchanged) ═══"
  echo "       codenamesduet-suggest-clue will return an error on use."
else
  echo "═══ 5. Setting ANTHROPIC_API_KEY edge function secret ═══"
  supabase secrets set "ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY"
fi
echo

# ════════════════════════════════════════════════════════════════
# 6. Deploy edge functions
# ════════════════════════════════════════════════════════════════
# `supabase functions deploy` with no args pushes every function under
# supabase/functions/ (codenamesduet-suggest-clue, define, and the
# *-build-board generators for spellingbee, wordwheel, waffle, boggle, and
# wordiply), so new ones are picked up automatically — nothing to edit here
# when adding a function. (define needs no extra secret: SUPABASE_URL / ANON /
# SERVICE_ROLE keys are auto-injected by the Edge Runtime, and it
# calls the public Wiktionary API with no key.)
#
# --use-api bundles the functions server-side instead of inside the local
# `edge-runtime` Docker image. That avoids the ECR-Public image pull (and
# its anonymous rate limits — `docker: toomanyrequests`, which broke this
# step) plus the Docker dependency entirely. We keep prod-faithful local
# execution via `supabase functions serve` (still Docker) + the solver's
# Vitest/C-oracle tests, so we don't lose meaningful parity by bundling
# server-side at deploy time.
#
# FIRST regenerate boggle's bundled dictionary asset. wordlist.ts is
# gitignored (it's a build artifact, ~1.2 MB) and the boggle-build-board
# function won't compile without it. We generate from the LOCAL stack —
# NOT the hosted DB this script targets — because the wordlist is derived
# from the canonical dictionary (words.tsv → local common.words) and
# hosted common.words isn't populated until step 8, several steps later.
# This mirrors `npm run deploy`, which also regenerates from local before
# `supabase functions deploy`. Requires the local stack up + words:import
# already run (psql against 127.0.0.1:54322).

echo "═══ 6. Deploying edge functions ═══"
echo "       Regenerating boggle wordlist asset (from LOCAL common.words)..."
SUPABASE_DB_URL='postgresql://postgres:postgres@127.0.0.1:54322/postgres' \
  npm run boggle:wordlist
supabase functions deploy --use-api
echo

# ════════════════════════════════════════════════════════════════
# 7. Wait for PostgREST schema-cache reload
# ════════════════════════════════════════════════════════════════
# Needed for the connections import (8b), which still goes through
# PostgREST: without the reload it hits PGRST106 "Invalid schema"
# because PostgREST hasn't picked up the new exposed_schemas yet.
# (spellingbee + definitions load via direct psql COPY and don't care
# about the REST cache, but connections does.) 15s is generous; the
# reload is usually <5s.

echo "═══ 7. Waiting 15s for PostgREST cache reload ═══"
sleep 15
echo

# ════════════════════════════════════════════════════════════════
# 8. Run data imports (`npm run import`)
# ════════════════════════════════════════════════════════════════
# `npm run import` runs every game's data import, in order:
#   words → spellingbee → wordwheel → connections → stackdown.
# It inherits the env exported above (SUPABASE_DB_URL for the psql-COPY
# loaders, SUPABASE_URL + SERVICE_ROLE_KEY for the PostgREST one), so it
# behaves identically here to running each script directly.
#
# Two transports:
#   - common.words + spellingbee/wordwheel pangrams bulk-load via psql COPY
#     over SUPABASE_DB_URL — fast, and immune to the PostgREST/HTTP keep-alive
#     drops that made batched API upserts fail mid-import against hosted.
#     These reseed (TRUNCATE + insert).
#   - connections upserts through PostgREST (SUPABASE_URL + SERVICE_ROLE_KEY);
#     it's small (one batch) and incremental (accumulates new NYT puzzles),
#     so it stays on the API path.
#
# stackdown loads its pre-generated board library from the committed file
# supabase/data/stackdown-boards.jsonl via psql (delete + insert). It does
# NOT regenerate — generation (npm run stackdown:gen) is slow (~10s/board,
# strict no-trap validation) and run locally only; the deploy just ships
# the vendored boards. (common.words, by contrast, loads live from the
# gamelist working copy ~/src/gamelist/words.tsv — see import-words.ts; it
# isn't vendored into this repo.)
#
# waffle, wordle, scrabble, boggle, and wordiply have NO data import step —
# waffle, boggle, and wordiply generate boards on demand via their edge
# functions (wordiply's picks a base + its word lists straight from
# common.words at build time), wordle picks a random target from common.words
# at create-game time, and scrabble's bag + board are constants in code. They
# just need their schema migrated (step 2) and exposed (step 3). (boggle's edge
# function does need its bundled wordlist asset, which step 6 regenerates
# before deploy.)
#
# ORDER MATTERS: common.words is the shared master word list, and both the
# spellingbee AND wordwheel pangram seeds are DERIVED from it — so the word
# list (which `npm run import` runs first) must load before either. (Word definitions
# now ship INSIDE common.words, seeded straight from the word list, so
# there's no separate definitions import.) The rest are independent.

echo "═══ 8. Data imports (npm run import) ═══"
npm run import
echo

# waffle has no import step — boards are generated on demand by the
# waffle-build-board edge function (deployed in the functions step).

# ════════════════════════════════════════════════════════════════
# 9. (optional) Build the FE + push to Netlify
# ════════════════════════════════════════════════════════════════
# Writes the new project's URL + publishable key into
# .env.production.local (gitignored), runs npm run build, then
# netlify deploy. Skipped when DEPLOY_FE=false.
#
# The local build picks up VITE_SUPABASE_URL +
# VITE_SUPABASE_PUBLISHABLE_KEY from .env.production.local and
# bakes them into the bundle at compile time, so Netlify's own
# env vars don't need to be in sync for this manual-push flow.

if [[ "$DEPLOY_FE" == "true" ]]; then
  echo "═══ 9. FE build + Netlify deploy ═══"

  # Write the production env file fresh. The user's previous file
  # may point at a different project; we overwrite cleanly. Vite
  # only knows about the two VITE_* fields, so writing just those
  # is sufficient for this project.
  echo "       Writing .env.production.local..."
  cat > .env.production.local <<EOF
VITE_SUPABASE_URL=${SUPABASE_URL}
VITE_SUPABASE_PUBLISHABLE_KEY=${SUPABASE_PUBLISHABLE_KEY}
EOF

  echo "       npm run build..."
  npm run build

  echo "       netlify deploy -p -d dist..."
  # -p = production deploy (vs. preview). -d dist = which folder
  # to publish. Requires the local checkout to already be
  # netlify-linked (your .netlify/ dir suggests it is).
  npx netlify deploy -p -d dist

  echo "       FE deployed."
else
  echo "═══ 9. Skipping FE build + deploy (DEPLOY_FE=false) ═══"
  echo "       To push manually:"
  echo "         (write .env.production.local from credentials file)"
  echo "         npm run build && npx netlify deploy -p -d dist"
fi
echo

# Re-save in case anything in the script changed PROJECT_REF or
# DB_PASSWORD (it shouldn't, but defensive). Idempotent.
save_credentials

echo "═════════════════════════════════════════════════════════════"
echo " All automated steps complete."
echo
echo " Credentials persisted to: ${CREDENTIALS_FILE}"
echo "   PROJECT_REF   = ${PROJECT_REF}"
echo "   SUPABASE_URL  = ${SUPABASE_URL}"
echo "   (DB_PASSWORD + SUPABASE_SERVICE_ROLE_KEY also in the file;"
echo "    not echoed to keep them out of terminal scrollback)"
echo
echo " Manual follow-ups:"
echo "   - Resend dashboard → Domains: verify your sender domain"
echo "     (one-time per domain — DNS records on your registrar)."
echo "     Without this Resend won't deliver from ${SMTP_SENDER_EMAIL:-<sender>}."
if [[ "$DEPLOY_FE" != "true" ]]; then
  echo "   - FE deploy skipped — run \`npm run build && npx netlify deploy -p -d dist\`"
  echo "     after writing .env.production.local with the values above."
fi
echo "═════════════════════════════════════════════════════════════"
