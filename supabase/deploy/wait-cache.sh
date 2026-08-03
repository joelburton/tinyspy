#!/usr/bin/env bash
# Step 7 — wait for PostgREST's schema cache to reload.
#
# The connections import goes through PostgREST; without the reload it
# fails with PGRST106 "Invalid schema" because the exposed-schemas
# change from config-api hasn't landed yet. (The psql-COPY loaders —
# words, pangrams, stackdown — don't care.) 15s is generous; the reload
# is usually under 5.
#
# Its own target because it's pure waiting: when you're re-running just
# the data import against an already-configured project, you can skip it.

. "$(dirname "$0")/env.sh"
say "7. Waiting ${WAIT_SECONDS:-15}s for the PostgREST cache reload"
sleep "${WAIT_SECONDS:-15}"
