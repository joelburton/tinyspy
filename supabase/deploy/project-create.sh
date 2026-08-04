#!/usr/bin/env bash
# Step 0 — create a fresh hosted Supabase project.
#
# The one step that COSTS something and can't be undone by re-running,
# so it is its own target and never a dependency of another. It no-ops
# loudly when PROJECT_REF is already set: pointing at an existing
# project is the normal case, and silently creating a second one would
# be the worst possible surprise.
#
# Discovers the org, generates a DB password if none was given, POSTs
# /v1/projects, polls to ACTIVE_HEALTHY (~60-120s in practice, 5 min
# ceiling), then fetches both API keys and saves everything to
# .deploy-credentials.cache before returning — so a crash in any later
# step still leaves a clean resume point.

. "$(dirname "$0")/env.sh"

if [[ -n "$PROJECT_REF" && "$PROJECT_REF" != *"REPLACE-WITH"* ]]; then
  say "0. Project already exists (${PROJECT_REF}) — nothing to create"
  echo "    To create a NEW one, clear PROJECT_REF in the secrets file"
  echo "    and delete ${CREDENTIALS_FILE}."
  exit 0
fi

say "0. Creating a new Supabase project"

if [[ -z "${ORG_ID:-}" ]]; then
  ORG_ID=$(api "https://api.supabase.com/v1/organizations" | jq -r '.[0].id')
  if [[ -z "$ORG_ID" || "$ORG_ID" == "null" ]]; then
    echo "ERROR: couldn't auto-discover an organization id; set ORG_ID." >&2
    exit 1
  fi
  echo "    org_id=${ORG_ID} (first org returned)"
fi

# 32 hex chars: strong, log-safe, no shell-quoting hazards.
if [[ -z "$DB_PASSWORD" ]]; then
  DB_PASSWORD=$(openssl rand -hex 16)
  echo "    generated a DB password (saved to ${CREDENTIALS_FILE})"
fi

payload=$(jq -n \
  --arg name "$PROJECT_NAME" --arg org_id "$ORG_ID" \
  --arg db_pass "$DB_PASSWORD" --arg region "$PROJECT_REGION" \
  --arg plan "$PROJECT_PLAN" \
  '{name: $name, organization_id: $org_id, db_pass: $db_pass,
    region: $region, plan: $plan}')

echo "    creating name=${PROJECT_NAME} region=${PROJECT_REGION}..."
response=$(api -X POST "https://api.supabase.com/v1/projects" -d "$payload")
PROJECT_REF=$(jq -r '.id' <<< "$response")
if [[ -z "$PROJECT_REF" || "$PROJECT_REF" == "null" ]]; then
  echo "ERROR: the create response carried no id." >&2
  echo "$response" >&2
  exit 1
fi
echo "    project_ref=${PROJECT_REF}"

echo "    waiting for ACTIVE_HEALTHY..."
status="UNKNOWN"
for i in $(seq 1 30); do
  sleep 10
  status=$(api "https://api.supabase.com/v1/projects/${PROJECT_REF}" | jq -r '.status // "UNKNOWN"')
  echo "      [${i}/30] ${status}"
  [[ "$status" == "ACTIVE_HEALTHY" ]] && break
done
if [[ "$status" != "ACTIVE_HEALTHY" ]]; then
  echo "ERROR: not ACTIVE_HEALTHY within 5 minutes (last: ${status})." >&2
  exit 1
fi

# Supabase's API still calls the public key "anon" even though the
# dashboards and SDKs have rebranded it "publishable".
echo "    fetching API keys..."
keys=$(api "https://api.supabase.com/v1/projects/${PROJECT_REF}/api-keys")
SUPABASE_SERVICE_ROLE_KEY=$(jq -r '.[] | select(.name == "service_role") | .api_key' <<< "$keys")
SUPABASE_PUBLISHABLE_KEY=$(jq -r '.[] | select(.name == "anon") | .api_key' <<< "$keys")
for pair in "service_role:$SUPABASE_SERVICE_ROLE_KEY" "anon:$SUPABASE_PUBLISHABLE_KEY"; do
  if [[ -z "${pair#*:}" || "${pair#*:}" == "null" ]]; then
    echo "ERROR: couldn't extract the ${pair%%:*} key." >&2
    exit 1
  fi
done

save_credentials
echo "    credentials saved to ${CREDENTIALS_FILE}"
