#!/usr/bin/env bash
# Step 9 — build the FE against the hosted project and push to Netlify.
#
# Writes .env.production.local (gitignored) fresh, because a previous
# file may point at a different project. Vite bakes VITE_SUPABASE_URL +
# VITE_SUPABASE_PUBLISHABLE_KEY into the bundle at COMPILE time, so
# Netlify's own env vars don't have to be in sync for this manual-push
# flow — the values that matter are the ones present right here.

. "$(dirname "$0")/env.sh"
require_project
fetch_api_keys

say "9. FE build + Netlify deploy"
announce_target

cat > .env.production.local <<EOF
VITE_SUPABASE_URL=${SUPABASE_URL}
VITE_SUPABASE_PUBLISHABLE_KEY=${SUPABASE_PUBLISHABLE_KEY}
EOF
echo "    wrote .env.production.local"

npm run build
# -p = production (not a preview); -d dist = the folder to publish.
# Requires the checkout to be netlify-linked already.
npx netlify deploy -p -d dist
