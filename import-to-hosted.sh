#!/usr/bin/env bash
#
# One-shot setup runner for a fresh hosted Supabase project.
#
# ════════════════════════════════════════════════════════════════
# THIS IS NOW A SHIM. The work lives in the Makefile.
# ════════════════════════════════════════════════════════════════
# This was a 762-line straight line of eleven numbered steps sharing one
# preamble — and that preamble, not the steps, was what made "just
# re-push the functions" impossible. The preamble is now
# supabase/deploy/env.sh (sourced), each step that needed a script is its
# own file in supabase/deploy/, and the Makefile owns the order.
#
# The entry point survives because it's what the docs and muscle memory
# say. It is exactly equivalent to:
#
#   gmake project-bootstrap ENV=prod MIGRATIONS=keep     (or =destroy)
#
# Prefer the make targets for anything narrower — that's the whole point
# of the split:
#
#   gmake db-sql ENV=prod                         # just functions/views/policies
#   gmake deploy-funcs ENV=prod                   # just the edge functions
#   gmake deploy-func-waffle-build-board ENV=prod # just one of them
#   gmake deploy-fe ENV=prod                      # just rebuild + redeploy the FE
#   gmake db-data ENV=prod                        # just reload the data tables
#   gmake g-stackdown-puzzles ENV=prod            # just the stackdown boards
#   gmake project-config-api ENV=prod             # just the PostgREST settings
#   gmake help                                    # everything
#
# What `project-bootstrap` does, in order:
#   0.  create the project (skipped when PROJECT_REF is already set)
#   1.  link this checkout to it
#   2.  apply migrations — the SHAPE half (--destroy wipes first)
#   2b. apply supabase/sql/ — the CODE half (functions, views, policies)
#   3.  PostgREST config: exposed schemas, search path, max_rows
#   4.  auth config: site URL, redirects, Resend SMTP, email template
#   5.  edge-function secrets (ANTHROPIC_API_KEY)
#   6.  deploy the edge functions (regenerating their word bundles)
#   7.  wait for the PostgREST schema-cache reload
#   8.  load the data tables (words → pangrams → boards → puzzles)
#   9.  build the FE and push it to Netlify
#
# Credentials + per-deployment values still live in
# import-to-hosted.secrets.sh (GITIGNORED):
#   cp import-to-hosted.secrets.example.sh import-to-hosted.secrets.sh
#
# Required local tools: gmake 4+ (brew install make), jq, psql, curl.
#
# What this does NOT do (do it yourself): verify the SMTP sender domain
# in the Resend dashboard — DNS records on your registrar, one-time per
# domain. Without it Resend won't deliver.

set -euo pipefail

usage() {
  echo "Usage: ./import-to-hosted.sh (--destroy | --keep)" >&2
  echo >&2
  echo "  --destroy  WIPE the remote DB, then replay ALL migrations from" >&2
  echo "             scratch. Use after editing an already-applied migration." >&2
  echo "             Destroys all hosted data, auth accounts included." >&2
  echo "  --keep     Apply only new (unrecorded) migrations, preserving data." >&2
  echo "             Fails on edited-migration drift (that's what --destroy fixes)." >&2
  echo >&2
  echo "Equivalent to: gmake project-bootstrap ENV=prod MIGRATIONS=destroy|keep" >&2
  echo "For narrower operations run \`gmake help\`." >&2
}

# The strategy flag has no default on purpose: one of the two modes
# wipes the entire hosted database, and that is not a thing to guess.
MODE=""
for arg in "$@"; do
  case "$arg" in
    --destroy|--keep)
      [[ -n "$MODE" ]] && { echo "ERROR: pass exactly one of --destroy / --keep." >&2; usage; exit 1; }
      MODE="${arg#--}"
      ;;
    -h|--help) usage; exit 0 ;;
    *) echo "ERROR: unknown argument '${arg}'." >&2; usage; exit 1 ;;
  esac
done
if [[ -z "$MODE" ]]; then
  echo "ERROR: you must specify a migration strategy: --destroy or --keep." >&2
  usage
  exit 1
fi

MAKE_BIN="$(command -v gmake || command -v make)"
if [[ -z "$MAKE_BIN" ]]; then
  echo "ERROR: GNU Make 4+ is required (brew install make → gmake)." >&2
  exit 1
fi

exec "$MAKE_BIN" project-bootstrap ENV=prod MIGRATIONS="$MODE"
