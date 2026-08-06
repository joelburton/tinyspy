#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════
# Audit the make system for the two bug classes that keep recurring.
# ════════════════════════════════════════════════════════════════
# Run it: `gmake _audit`
#
# Why this exists: six bugs in a row here shared a shape. None was a syntax
# error; all were about WHICH ENVIRONMENT or WHICH STATE a target actually
# reaches, and all were invisible to "run it once and watch it work":
#
#   • stamps survived `db reset`, so db-reset left the word tables empty
#   • `gmake -n deploy-func-… ENV=prod` really deployed (a recipe mentioning
#     $(MAKE) runs under -n, and .ONESHELL makes that the whole recipe)
#   • trie + genpuzzles targets depended on the per-ENV stamp, so ENV=prod
#     would import 283k words into prod to build a local file
#   • db-seed inherited the caller's SUPABASE_DB_URL
#   • project-db-destroy couldn't be protected by ENV at all, because
#     `supabase … --linked` ignores the connection string
#   • `gmake -j8 deploy ENV=local` ran `supabase db reset` and `supabase link`
#     BEFORE _require-prod's refusal landed — prerequisite order, which the
#     guards rely on, only exists in serial make (.NOTPARALLEL fixes it)
#
# So the checks are behavioural, not textual. Two of the three run every
# target rather than the one someone happened to think of.
#
# The trick throughout: PATH shims for every command that could touch a
# database or a deploy target. They log their invocation (with the
# SUPABASE_DB_URL they were handed) and exit 0, so a "real" run is fully
# observable and completely inert.

set -euo pipefail
cd "$(dirname "$0")/../.."

MAKE_BIN="$(command -v gmake || command -v make)"
TMP="$(mktemp -d)"

# Check 2 uses `-B`, which forces the stamp recipes to run — and their final
# `touch` would leave every stamp NEWER than words.tsv, silently cancelling a
# real pending import. So the stamps are snapshotted and put back. An audit
# that changes the state it audits is worse than no audit.
if [[ -d .make ]]; then cp -Rp .make "$TMP/make-backup"; fi
restore() {
  rm -rf .make
  if [[ -d "$TMP/make-backup" ]]; then cp -Rp "$TMP/make-backup" .make; fi
  rm -rf "$TMP"
}
trap restore EXIT
SHIMS="$TMP/shims"
mkdir -p "$SHIMS"
export SHIM_LOG="$TMP/log.txt"

# Everything a target could plausibly use to reach a database, a hosted
# project, or Netlify. `npm` is shimmed too, so recipes that delegate to an
# npm script are caught at the boundary rather than running for real.
for cmd in supabase psql npm npx netlify curl openssl node; do
  cat > "$SHIMS/$cmd" <<SHIM
#!/usr/bin/env bash
printf '%s\t%s\t%s\n' "$cmd" "\${SUPABASE_DB_URL:-<unset>}" "\$*" >> "\$SHIM_LOG"
exit 0
SHIM
  chmod +x "$SHIMS/$cmd"
done

fails=0
# Failure messages quote what a shim was handed, which for ENV=prod is a live
# connection string complete with the database password. Mask it — an audit
# should not be the thing that puts prod's password in your scrollback.
mask() { sed -E 's#:[^:@/]*@#:****@#g'; }
note() { printf '  \033[31mFAIL\033[0m  %s\n' "$*"; fails=$((fails + 1)); }
pass() { printf '  ok    %s\n' "$*"; }

# Every documented target, discovered from `help` so a NEW target is covered
# by check 1 automatically — no list to forget to update. `%` patterns are
# instantiated with a real function name.
# (a while-read loop, not `mapfile` — macOS ships bash 3.2, which has neither
# mapfile nor readarray, and this script has to run on the machine it audits)
TARGETS=()
while IFS= read -r t; do TARGETS+=("$t"); done < <(
  grep -hE '^[a-zA-Z0-9_%-]+:.*?## ' Makefile |
    sed 's/:.*//' |
    grep -v '^help$' |
    grep -v '^_audit$' |
    sed 's/^deploy-func-%$/deploy-func-waffle-build-board/'
)

# ────────────────────────────────────────────────────────────────
echo "1. every target is inert under \`-n\` (ENV=prod)"
# GNU Make executes a recipe containing $(MAKE) even under -n; with .ONESHELL
# that is the WHOLE recipe, deploys included. The rule this enforces:
# composite targets hold nothing but sub-makes and echoes; anything that
# writes lives in its own target, reached by a sub-make that inherits -n.
for t in "${TARGETS[@]}"; do
  : > "$SHIM_LOG"
  PATH="$SHIMS:$PATH" "$MAKE_BIN" -n "$t" ENV=prod >/dev/null 2>&1 || true
  if [[ -s "$SHIM_LOG" ]]; then
    note "-n $t executed: $(head -1 "$SHIM_LOG" | cut -f1,3 | mask)"
  fi
done
(( fails == 0 )) && pass "${#TARGETS[@]} targets, nothing executed"

# ────────────────────────────────────────────────────────────────
echo "2. local-only targets ignore the caller's SUPABASE_DB_URL"
# These build local artefacts from the local dictionary, or seed dev personas.
# None may ever reach another database — not via ENV, and not via a stray
# export in the caller's shell. ADD A TARGET HERE when you add one that must
# stay local; check 1 covers new targets automatically, this one cannot.
LOCAL_ONLY=(all-tries g-boggle-trie g-scrabble-trie g-stackdown-genpuzzles db-seed)
POISON="postgresql://poison:poison@127.0.0.1:1/nope"
for t in "${LOCAL_ONLY[@]}"; do
  : > "$SHIM_LOG"
  # -B forces the recipe to run even when its output is up to date, which is
  # the only way to observe what it would hand to psql/npm.
  SUPABASE_DB_URL="$POISON" PATH="$SHIMS:$PATH" \
    "$MAKE_BIN" -B "$t" ENV=prod >/dev/null 2>&1 || true
  if grep -q "$POISON" "$SHIM_LOG"; then
    note "$t passed the caller's SUPABASE_DB_URL through"
  elif [[ ! -s "$SHIM_LOG" ]]; then
    note "$t ran nothing — the check proves nothing; fix the audit"
  else
    pass "$t"
  fi
done

# ────────────────────────────────────────────────────────────────
echo "3. destructive targets refuse the wrong ENV"
# project-db-destroy is the one target ENV cannot protect on its own:
# `supabase db reset --linked` reads the CLI link, not a connection string.
# db-reset is the mirror image — local-only, and it must not accept prod.
# A DELIBERATE refusal, not merely a failure. The distinction is the whole
# point: project-db-destroy once "refused" ENV=local only because the local
# prelude left announce_target undefined and bash exited 127. That looks
# identical to a guard from the outside, and it evaporates the moment someone
# tidies the line away. So the guard has to announce itself — every one of
# them prints REFUSED: — and this asserts on that, not on the exit code.
check_refuses() { # target, ENV, description
  : > "$SHIM_LOG"
  local out
  out=$(PATH="$SHIMS:$PATH" "$MAKE_BIN" "$1" ENV="$2" 2>&1) && {
    note "$1 ENV=$2 SUCCEEDED — it must refuse ($3)"
    return
  }
  if [[ -s "$SHIM_LOG" ]]; then
    note "$1 ENV=$2 failed, but only AFTER running: $(head -1 "$SHIM_LOG" | cut -f1,3 | mask)"
  elif ! grep -q 'REFUSED:' <<< "$out"; then
    note "$1 ENV=$2 failed without refusing — an accidental crash, not a guard"
  else
    pass "$1 refuses ENV=$2"
  fi
}
check_refuses project-db-destroy local "would wipe prod from a local-looking command"
check_refuses db-reset prod "would wipe the hosted DB expecting the local one"
# The deploy family reaches production whatever ENV says — `supabase functions
# deploy` and `netlify deploy` read a link, not a connection string. `gmake
# deploy` with the default ENV=local once wiped the LOCAL database (db-schema
# took its local branch) and then pushed to PRODUCTION anyway. Both halves of
# that, from one un-suffixed command.
check_refuses deploy local "wipes local via db-schema, then deploys to prod"
check_refuses deploy-funcs local "says '→ local' while uploading to prod"
check_refuses deploy-fe local "netlify deploy ignores ENV"
check_refuses deploy-func-waffle-build-board local "same, for one function"

# ────────────────────────────────────────────────────────────────
echo "4. database targets refuse a MISSING ENV"
# There is no default ENV, because a default is a guess about which database
# you meant. Anything that talks to one must say so rather than pick.
check_refuses_no_env() { # target
  : > "$SHIM_LOG"
  local out
  out=$(PATH="$SHIMS:$PATH" "$MAKE_BIN" "$1" 2>&1) && {
    note "$1 with no ENV SUCCEEDED — it must refuse"
    return
  }
  if [[ -s "$SHIM_LOG" ]]; then
    note "$1 with no ENV failed, but only AFTER running: $(head -1 "$SHIM_LOG" | cut -f1,3 | mask)"
  elif ! grep -q 'REFUSED:' <<< "$out"; then
    note "$1 with no ENV failed without refusing — no usable message"
  else
    pass "$1 refuses a missing ENV"
  fi
}
for t in db-sql db-schema db-schema-sql db db-data all-words db-psql \
         g-stackdown-puzzles g-connections-puzzles all-pangrams db-reset deploy \
         _stamps-clean db-backup db-restore db-drift db-add-user; do
  check_refuses_no_env "$t"
done

# ────────────────────────────────────────────────────────────────
echo "5. guards hold under parallel make (-j8)"
# Prerequisites build CONCURRENTLY under -j, so "the guard is listed first"
# stops meaning "the guard runs first". Without the Makefile's .NOTPARALLEL,
# `gmake -j8 deploy ENV=local` really ran `supabase db reset` (wiping the
# local DB) and `supabase link` before _require-prod's refusal landed. Same
# shims as check 3, but raced: whatever the exit status, the shim log must
# stay EMPTY — refusing after the reset is not refusing.
check_parallel_inert() { # target, ENV
  : > "$SHIM_LOG"
  PATH="$SHIMS:$PATH" "$MAKE_BIN" -j8 "$1" ENV="$2" >/dev/null 2>&1 || true
  if [[ -s "$SHIM_LOG" ]]; then
    note "-j8 $1 ENV=$2 ran work before refusing: $(head -1 "$SHIM_LOG" | cut -f1,3 | mask)"
  else
    pass "-j8 $1 ENV=$2 stays inert"
  fi
}
check_parallel_inert deploy local
check_parallel_inert deploy-funcs local
check_parallel_inert deploy-fe local
check_parallel_inert db-reset prod
check_parallel_inert project-db-destroy local

# ────────────────────────────────────────────────────────────────
echo "6. env.sh discards an inherited SUPABASE_DB_URL"
# A stray export in the caller's shell must not redirect ENV=prod writes: the
# connection string comes from the secrets file or is derived from the DB
# password — never from the ambient environment. env.sh unsets it BEFORE
# sourcing the secrets file, so a value pinned there still wins.
#
# Tested against a MINIMAL secrets file in a temp dir (env.sh resolves
# deploy.secrets.sh relative to cwd) — the real secrets file pins
# SUPABASE_DB_URL="", which would mask a regression here. The OK: sentinel
# distinguishes "discarded" from "env.sh died before the echo": a check that
# passes because it never ran is the audit's own bug class.
ENVTEST="$TMP/envtest"; mkdir -p "$ENVTEST"
printf 'PERSONAL_ACCESS_TOKEN="sbp_audit_dummy"\n' > "$ENVTEST/deploy.secrets.sh"
ENV_SH="$(pwd)/supabase/deploy/env.sh"
got=$(cd "$ENVTEST" && SUPABASE_DB_URL="$POISON" bash -c \
  "source \"$ENV_SH\" >/dev/null 2>&1 && echo \"OK:\${SUPABASE_DB_URL:-}\"") || true
case "$got" in
  "OK:$POISON") note "env.sh kept the caller's SUPABASE_DB_URL" ;;
  "OK:")        pass "ambient SUPABASE_DB_URL discarded (a secrets-file value still wins)" ;;
  *)            note "couldn't source env.sh against the minimal secrets file — fix the audit" ;;
esac

# ────────────────────────────────────────────────────────────────
echo
if (( fails )); then
  echo "make audit: ${fails} problem(s)"
  exit 1
fi
echo "make audit: clean"
