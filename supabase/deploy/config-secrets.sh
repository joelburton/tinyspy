#!/usr/bin/env bash
# Step 5 — set the edge-function secrets.
#
# Only ANTHROPIC_API_KEY today (codenamesduet's clue suggester,
# scrabble's move suggester + AI opponent, crosswords' clue explainer).
# Skipped with a clear message rather than failing when it's still a
# placeholder: every other feature works without it.

. "$(dirname "$0")/env.sh"
require_project

if [[ "${ANTHROPIC_API_KEY:-}" == *"REPLACE-WITH"* || -z "${ANTHROPIC_API_KEY:-}" ]]; then
  say "5. Skipping edge-function secrets (ANTHROPIC_API_KEY unset)"
  echo "    The AI features will return an error when used."
  exit 0
fi

say "5. Setting edge-function secrets"
supabase secrets set "ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY"
