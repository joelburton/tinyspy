#!/usr/bin/env bash
# cs-unmet

# ════════════════════════════════════════════════════════════════
# Rehearse pending migrations against a copy of production's rows.
# ════════════════════════════════════════════════════════════════
# Run it: `gmake db-rehearse ENV=local DUMP=backups/<f>.dump SINCE=<version>`
#
# WHY THIS EXISTS. A migration that only changes SHAPE is exercised by the
# normal loop: `supabase db reset` builds the new shape from scratch and
# anything malformed fails immediately. A migration that also MOVES DATA is
# not exercised at all — the reset produces an empty database, so every
# backfill statement runs over zero rows, reports success, and proves
# nothing. Production is then the first place the statement ever meets a row.
#
# This closes that gap by staging what production will do, locally:
#
#   1. hold back the migrations production has not applied yet
#   2. `supabase db reset` — the database is now at PRODUCTION's shape, empty
#   3. restore the dump — production's actual rows, in their old shape
#   4. put the migrations back and apply them, one at a time, over those rows
#
# Step 1 is the non-obvious one. A file left in `supabase/migrations/` during
# step 2 is applied by the reset, and then the dump — written against the old
# shape — cannot be restored at all: pg_restore's COPY names a table or a
# column that the migration just renamed away.
#
# WHAT IT DOES NOT COVER. The dump excludes the dictionary and seed bulk
# (see BACKUP_EXCLUDE in the Makefile), so those tables come back empty and
# are reloaded afterwards by the make target that calls this — the pgTAP
# suite needs the real word list.

set -euo pipefail
cd "$(dirname "$0")/../.."

DUMP=${DUMP:-}
SINCE=${SINCE:-}
DB_URL=${SUPABASE_DB_URL:-}
MIGRATIONS=supabase/migrations

# ── refusals ────────────────────────────────────────────────────
# This target DROPS the database it is pointed at, so it checks the
# connection string itself rather than trusting the caller's ENV.
[[ "$DB_URL" == *"127.0.0.1:54322"* ]] || {
  echo "REFUSED: SUPABASE_DB_URL is not the local stack — this drops the database." >&2
  exit 1
}
[[ -n "$DUMP" ]] || { echo "REFUSED: pass DUMP=backups/<file>.dump" >&2; exit 1; }
[[ -f "$DUMP" ]] || { echo "REFUSED: $DUMP does not exist" >&2; exit 1; }
[[ "$SINCE" =~ ^[0-9]{14}$ ]] || {
  echo "REFUSED: pass SINCE=<14-digit migration version> — the FIRST migration" >&2
  echo "         production has NOT applied. Everything from it onward is held" >&2
  echo "         back, restored over, and then replayed. There is no default:" >&2
  echo "         the cut is a fact about the hosted project, not about this" >&2
  echo "         checkout, and \`supabase migration list --linked\` is what" >&2
  echo "         answers it." >&2
  exit 1
}

# ── the migrations to replay ────────────────────────────────────
# Version-sorted, so they are put back and applied in the same order
# production would apply them.
held=()
for f in "$MIGRATIONS"/*.sql; do
  version=${f##*/}; version=${version%%_*}
  # `>` inside [[ ]] is a string comparison, which is the right one here:
  # every version is fourteen digits, so it sorts as it reads.
  if [[ ! "$version" < "$SINCE" ]]; then held+=("$f"); fi
done
[[ ${#held[@]} -gt 0 ]] || {
  echo "REFUSED: no migration at or after $SINCE — there is nothing to rehearse." >&2
  exit 1
}

echo "── rehearsing ${#held[@]} migration(s) over $DUMP"
for f in "${held[@]}"; do echo "     ${f##*/}"; done

# Two temp directories, deliberately: the held-back migrations are put back
# by a trap, and the row-count snapshots have to outlive that.
HELD_DIR=$(mktemp -d)
WORK=$(mktemp -d)
# The held-back files come back whatever happens — an interrupted rehearsal
# must not leave the checkout missing a migration.
restore_migrations() {
  shopt -s nullglob
  for f in "$HELD_DIR"/*.sql; do mv -n "$f" "$MIGRATIONS/"; done
  shopt -u nullglob
}
trap restore_migrations EXIT

# Exact counts for every table in the app schemas, via query_to_xml — the
# one way to count a list of tables you do not know at write time without
# leaving SQL. Row conservation across a rename is the thing to read.
count_rows() {
  psql -X -At -F $'\t' -v ON_ERROR_STOP=1 "$DB_URL" -c "
    select t.table_schema || '.' || t.table_name,
           (xpath('/row/c/text()',
                  query_to_xml(format('select count(*) as c from %I.%I',
                                      t.table_schema, t.table_name),
                               false, true, '')))[1]::text::bigint
      from information_schema.tables t
     where t.table_type = 'BASE TABLE'
       and t.table_schema = any (array[
         'common', 'codenamesduet', 'psychicnum', 'connections',
         'spellingbee', 'bananagrams', 'waffle', 'wordle', 'stackdown',
         'scrabble', 'boggle', 'crosswords', 'wordwheel', 'wordiply',
         'strands', 'letterboxed', 'setgame'])
     order by 1
  "
}

# ── 1. production's shape, empty ────────────────────────────────
mv "${held[@]}" "$HELD_DIR/"
echo "── db reset (without the held-back migrations: production's shape)"
# The reset drops the database, so every stamp claiming a table is loaded
# is now a lie — the same reason db-schema clears them.
rm -f .make/local/*.stamp
supabase db reset

# ── 2. production's rows, in their old shape ────────────────────
echo "── restoring $DUMP (data only)"
toc=$(mktemp)
bash supabase/scripts/backup-toc-order.sh "$DUMP" > "$toc"
pg_restore --data-only --single-transaction -L "$toc" -d "$DB_URL" "$DUMP"
rm -f "$toc"
count_rows > "$WORK/before.tsv"
echo "── restored $(awk -F'\t' '{n += $2} END {print n+0}' "$WORK/before.tsv") rows in $(wc -l < "$WORK/before.tsv" | tr -d ' ') tables"

# ── 3. the migrations, over those rows ──────────────────────────
restore_migrations
trap - EXIT
echo "── applying the held-back migration(s)"
supabase migration up --local

count_rows > "$WORK/after.tsv"
echo "── now $(awk -F'\t' '{n += $2} END {print n+0}' "$WORK/after.tsv") rows in $(wc -l < "$WORK/after.tsv" | tr -d ' ') tables"
# Collected before it is tested, not tested by the pipeline's exit status:
# under `pipefail` a diff that FINDS differences exits 1, so `if diff | grep`
# would print the changes and then announce that there were none.
changes=$(diff -U 0 "$WORK/before.tsv" "$WORK/after.tsv" | grep -E '^[-+][a-z]' || true)
echo "── what the migration(s) did to the row counts:"
if [[ -n "$changes" ]]; then
  echo "$changes"
  echo "   (a rename reads as one '-' and one '+' with the SAME count)"
else
  echo "   nothing — every table kept its name and its rows"
fi
rm -rf "$HELD_DIR" "$WORK"

# ── 4. the behavior half, which the reset does not apply ────────
echo "── supabase/sql/ (functions, views, policies, grants)"
npm run _sql:apply

# The local database now holds production's accounts and games, not the dev
# personas — signing in as moth or ada will not work until it is rebuilt.
echo "── this database is now a copy of production; \`gmake db-reset ENV=local\`"
echo "   puts the dev personas back when you are done rehearsing."
