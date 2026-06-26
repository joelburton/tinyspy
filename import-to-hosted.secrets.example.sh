# shellcheck shell=bash disable=SC2034
#
# Secrets + per-deployment config for import-to-hosted.sh.
#
# Copy this to import-to-hosted.secrets.sh (which is GITIGNORED) and
# fill in your values. import-to-hosted.sh sources that copy, so it
# never carries secrets itself and is safe to commit.
#
#   cp import-to-hosted.secrets.example.sh import-to-hosted.secrets.sh
#   # edit import-to-hosted.secrets.sh
#   ./import-to-hosted.sh --destroy        (or --keep)
#
# Anything left as a REPLACE-WITH placeholder or blank is treated as
# "not set": optional steps that depend on it log "skipped" and move on.

# ─── Required ──────────────────────────────────────────────────
# PERSONAL_ACCESS_TOKEN — supabase.com/dashboard/account/tokens →
# "Generate new token". Used for every Management API call and the
# supabase CLI. The only field you ALWAYS need.
PERSONAL_ACCESS_TOKEN="REPLACE-WITH-PERSONAL-ACCESS-TOKEN"

# ─── Project ───────────────────────────────────────────────────
# Leave PROJECT_REF placeholdered to create a brand-new project; set
# it to an existing ref to skip creation and reuse that project.
PROJECT_REF="REPLACE-WITH-EXISTING-PROJECT-REF-OR-LEAVE-PLACEHOLDER"

# Used only when creating a new project.
PROJECT_NAME="pupgames"
PROJECT_REGION="us-west-1"
PROJECT_PLAN="free"

# Optional Supabase org id. Blank = auto-pick the first org the API
# returns (fine for single-org accounts).
ORG_ID=""

# Optional DB password for a new project. Blank = auto-generate a
# 32-char random one (logged at the end of the run so you can save it).
DB_PASSWORD=""

# Optional API keys. Blank = auto-fetch from the Management API once
# the project is healthy. Provide values only to reuse an existing
# project and skip the API call.
SUPABASE_SERVICE_ROLE_KEY=""
SUPABASE_PUBLISHABLE_KEY=""

# Optional full Postgres connection string for the COPY-based bulk
# loaders. Blank = auto-construct the DIRECT connection
# (db.<ref>.supabase.co) from the DB password. Set this only if the
# direct host won't connect on your network (paste the Session Pooler
# string from Dashboard → Database → Connection string).
SUPABASE_DB_URL=""

# Whether to run the FE build + Netlify deploy at the end (step 9).
DEPLOY_FE=true

# ─── Edge function secrets (optional) ──────────────────────────
# Anthropic key for the codenamesduet-suggest-clue edge function.
# Leave the placeholder to skip the `secrets set` step.
ANTHROPIC_API_KEY="REPLACE-WITH-ANTHROPIC-API-KEY-OR-LEAVE-PLACEHOLDER"

# ─── Auth: site URL + Resend SMTP (optional) ───────────────────
# The Netlify URL where the FE is hosted — magic-link redirect target
# and the only allowed redirect URL. Leave placeholdered to skip the
# auth-config step until the FE is deployed.
SITE_URL="REPLACE-WITH-SITE-URL"            # e.g. https://pupgames.netlify.app

# Resend dashboard → API Keys → one with email:send permission.
RESEND_API_KEY="REPLACE-WITH-RESEND-API-KEY-OR-LEAVE-PLACEHOLDER"

# The "From:" address — must be at a domain verified in Resend.
SMTP_SENDER_EMAIL="REPLACE-WITH-SENDER-EMAIL"   # e.g. noreply@pupgames.io

# Display name in the From header.
SMTP_SENDER_NAME="PupGames"
