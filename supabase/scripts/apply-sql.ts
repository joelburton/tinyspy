#!/usr/bin/env -S npx tsx
/**
 * Apply the repeatable SQL files — `supabase/sql/*.sql` — to a database.
 *
 * The project splits each game's SQL in two (docs/supabase.md → Schema vs
 * code):
 *
 *   supabase/migrations/<ts>_<game>.sql  tables, constraints, indexes, the
 *                                        Realtime publication, seed rows.
 *                                        Applied ONCE and then frozen —
 *                                        `alter table` can't be re-run.
 *   supabase/sql/<game>.sql              functions, views, policies,
 *                                        triggers, grants. Drop-and-recreate
 *                                        safe, so it is re-applied IN FULL
 *                                        every time this script runs.
 *
 * That split is why changing an RPC doesn't add a migration: you edit the
 * game's one file and re-apply it. This script is the "re-apply" half, and it
 * runs in both places that need it — `npm run db:reset` locally, and
 * `npm run deploy` against the hosted project.
 *
 * **`common.sql` goes first.** Every game's functions and policies call into
 * `common` (`is_club_member`, `require_game_player`, `create_game`, …) and a
 * policy can only reference a function that already exists. The games have no
 * ordering between themselves — the removability invariant (docs/common.md)
 * forbids one game referencing another — so alphabetical is fine for the rest.
 *
 * Each file runs in ONE transaction (`--single-transaction` + ON_ERROR_STOP):
 * a syntax error halfway through leaves the schema as it was rather than
 * half-updated.
 *
 * Connection: `SUPABASE_DB_URL`, defaulting to the local stack. Pass
 * `--require-url` to make the default an error instead — `deploy` uses that so
 * a hosted deploy can never silently re-apply functions to localhost.
 *
 * Usage:  npm run sql:apply
 *         SUPABASE_DB_URL=<hosted> npm run sql:apply -- --require-url
 */

import { execFileSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { resolve } from 'node:path'

const LOCAL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
const requireUrl = process.argv.includes('--require-url')

if (requireUrl && !process.env.SUPABASE_DB_URL) {
  console.error(
    'ERROR: --require-url was passed but SUPABASE_DB_URL is unset.\n' +
      'Refusing to apply the repeatable SQL to the local stack during a deploy.',
  )
  process.exit(1)
}

const DB_URL = process.env.SUPABASE_DB_URL ?? LOCAL
const SQL_DIR = resolve(import.meta.dirname, '../sql')

// common first, then the games alphabetically (see the header).
const files = readdirSync(SQL_DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort((a, b) => (a === 'common.sql' ? -1 : b === 'common.sql' ? 1 : a.localeCompare(b)))

const safeTarget = DB_URL.replace(/:[^:@/]*@/, ':****@')
console.log(`Applying ${files.length} repeatable SQL file(s) → ${safeTarget}`)

for (const f of files) {
  process.stdout.write(`  ${f.padEnd(20)}`)
  try {
    execFileSync(
      'psql',
      ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '--single-transaction', '-d', DB_URL, '-f',
       resolve(SQL_DIR, f)],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    )
    console.log('ok')
  } catch (e) {
    console.log('FAILED')
    const err = e as { stderr?: string; stdout?: string }
    console.error(err.stderr ?? err.stdout ?? String(e))
    process.exit(1)
  }
}
// PostgREST caches the schema — including every function signature it will
// expose as an RPC — and only reloads when told. This used to be free: the
// functions lived inside the migrations, so `db reset` created them before the
// containers came back up. Now they arrive AFTER, which left PostgREST serving
// a cache with no RPCs in it: every call failed with
//   Could not find the function <schema>.<fn>(…) in the schema cache
// even though psql could see it perfectly. The whole e2e suite failed this way
// after a db-reset, and the same staleness would hit a hosted `db-sql` that
// changed a signature.
//
// NOTIFY is the documented reload channel and costs nothing.
try {
  execFileSync('psql', ['-X', '-q', '-d', DB_URL, '-c', "notify pgrst, 'reload schema'"], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  console.log('PostgREST schema cache reload signalled.')
} catch (e) {
  // Not fatal: the SQL is applied either way, and a hosted project also
  // reloads on its own within a minute. Say so rather than failing the deploy.
  console.warn('WARNING: could not signal a PostgREST reload:', (e as Error).message)
}

console.log('Repeatable SQL applied.')
