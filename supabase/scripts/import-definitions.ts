#!/usr/bin/env -S npx tsx
/**
 * Seed `common.definitions` from the vendored Scrabble dictionary
 * (`supabase/data/scrabble-defs.tsv`) using psql `COPY` — the right
 * tool for bulk loading.
 *
 * Strategy: TRUNCATE, then plain INSERT (no upsert). This is a full
 * reseed of a reference table — there's nothing to preserve — so we
 * empty it and load fresh. COPY streams the whole file to the server
 * over ONE direct Postgres connection, which sidesteps the
 * PostgREST/HTTP keep-alive failures that made batched API upserts
 * flaky against a hosted project (the gateway kept closing reused
 * connections mid-import). ~192k rows land in about a second.
 *
 * The file is already `word<TAB>def`, so there's no row processing to
 * do in TS at all — psql does the loading. We COPY into a staging
 * temp table and INSERT with the constant `source='scrabble'` tag
 * (the table's `source` column is NOT NULL, so we can't COPY straight
 * into it). The whole thing is one transaction: if anything fails it
 * rolls back, leaving the previous contents intact.
 *
 * Connection: `SUPABASE_DB_URL`, a Postgres connection string.
 * Defaults to the local stack. The deploy script
 * (import-to-hosted.sh) sets it to the hosted project's connection.
 *
 * Requires `psql` on PATH.
 *
 * Usage:  npm run defs:import
 */

import { execFileSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const DB_URL =
  process.env.SUPABASE_DB_URL ??
  'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DEFS_PATH = resolve(__dirname, '../data/scrabble-defs.tsv')

// One transaction: empty the table, COPY the word/def pairs into a
// staging temp table, then INSERT them with the constant source tag.
// `\copy` (client-side) streams the file over the psql connection —
// no HTTP, no batching. ON_ERROR_STOP aborts (and thus rolls back)
// on any failure, so a partial load can't leave the table half-empty.
const sql = `
\\set ON_ERROR_STOP on
begin;
truncate common.definitions;
create temp table _defs_staging (word text, def text) on commit drop;
\\copy _defs_staging (word, def) from '${DEFS_PATH}'
insert into common.definitions (word, def, source)
  select word, def, 'scrabble' from _defs_staging;
commit;
select count(*) || ' definitions loaded' as result from common.definitions;
`

// Mask the password when echoing the target, so a connection string
// never lands in logs / CI output.
const safeTarget = DB_URL.replace(/:[^:@/]*@/, ':****@')
console.log(`Loading ${DEFS_PATH}`)
console.log(`  into ${safeTarget}`)

try {
  execFileSync('psql', [DB_URL], {
    input: sql,
    stdio: ['pipe', 'inherit', 'inherit'],
  })
} catch (e) {
  console.error('\npsql load failed:', e instanceof Error ? e.message : String(e))
  process.exit(1)
}
