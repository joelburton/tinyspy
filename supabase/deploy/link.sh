#!/usr/bin/env bash
# Step 1 — link this checkout to the hosted project.
#
# Idempotent: re-linking to the same ref no-ops. Everything the
# supabase CLI does against prod (db push, functions deploy, secrets
# set) reads the link, so this is a prerequisite of all of them.

. "$(dirname "$0")/env.sh"
require_project

say "1. Linking checkout to ${PROJECT_REF}"
supabase link --project-ref "$PROJECT_REF"
