# shellcheck shell=bash disable=SC2034
#
# Secrets + per-deployment config for the hosted deploy targets.
#
# Copy this to deploy.secrets.sh (which is GITIGNORED) and fill in your
# values. supabase/deploy/env.sh sources that copy on every `ENV=prod`
# target, so nothing in the repo carries a secret.
#
#   cp deploy.secrets.example.sh deploy.secrets.sh
#   # edit deploy.secrets.sh
#   gmake project-bootstrap ENV=prod MIGRATIONS=destroy   (or =keep)
#
# `gmake help` lists the narrower targets — you rarely want the whole
# bootstrap after the first run.
#
# Anything left as a REPLACE-WITH placeholder or blank is treated as
# "not set": optional steps that depend on it log "skipped" and move on.
#
# Keep this file at mode 600 — it carries your Supabase PAT and, once
# filled in, the Resend and Anthropic keys. supabase/deploy/env.sh checks
# on every prod target and tightens it if it isn't.

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
PROJECT_NAME="puzpuzpuz"
PROJECT_REGION="us-west-1"
PROJECT_PLAN="free"

# Optional Supabase org id. Blank = auto-pick the first org the API
# returns (fine for single-org accounts).
ORG_ID=""

# DB password. Blank = `gmake project-create` generates a 32-char random
# one and saves it to .deploy-credentials.cache.
#
# **This is the one field nothing can recover.** Supabase hashes it, and the
# dashboard's reveal is one-shot — so if the only copy is in
# .deploy-credentials.cache (gitignored, one machine, one file) and that file
# goes, your only move is Settings → Database → Reset password, which
# invalidates the connection string everywhere. Once a project exists, PASTE
# IT HERE. This file is the durable, hand-edited one; that one is a cache.
DB_PASSWORD=""

# Optional API keys. Blank = auto-fetch from the Management API with the PAT
# above, whenever they're needed, and cached to .deploy-credentials.cache.
# Genuinely optional — unlike DB_PASSWORD, these are always recoverable.
SUPABASE_SERVICE_ROLE_KEY=""
SUPABASE_PUBLISHABLE_KEY=""

# Optional full Postgres connection string for the COPY-based bulk
# loaders. Blank = auto-construct the DIRECT connection
# (db.<ref>.supabase.co) from the DB password. Set this only if the
# direct host won't connect on your network (paste the Session Pooler
# string from Dashboard → Database → Connection string).
SUPABASE_DB_URL=""

# ─── Edge function secrets (optional) ──────────────────────────
# Anthropic key for the codenamesduet-suggest-clue edge function.
# Leave the placeholder to skip the `secrets set` step.
ANTHROPIC_API_KEY="REPLACE-WITH-ANTHROPIC-API-KEY-OR-LEAVE-PLACEHOLDER"

# ─── Auth: site URL + Resend SMTP (optional) ───────────────────
# The Netlify URL where the FE is hosted — magic-link redirect target
# and the only allowed redirect URL. Leave placeholdered to skip the
# auth-config step until the FE is deployed.
SITE_URL="REPLACE-WITH-SITE-URL"            # e.g. https://puzpuzpuz.netlify.app

# Resend dashboard → API Keys → one with email:send permission.
RESEND_API_KEY="REPLACE-WITH-RESEND-API-KEY-OR-LEAVE-PLACEHOLDER"

# The "From:" address — must be at a domain verified in Resend.
SMTP_SENDER_EMAIL="REPLACE-WITH-SENDER-EMAIL"   # e.g. noreply@puzpuzpuz.io

# Display name in the From header.
SMTP_SENDER_NAME="PuzPuzPuz"
