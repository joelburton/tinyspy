#!/usr/bin/env -S npx tsx
/**
 * Load the generated Waffle (SyrupSwap) puzzle library from the
 * vendored, gzipped TSV at `supabase/data/waffle-puzzles.tsv.gz` into
 * `waffle.puzzles` using psql `COPY`.
 *
 * The TSV is `solution \t scramble \t par_swaps \t title`, one puzzle
 * per line (boards are 25-char strings, holes = '.'). `id` is omitted
 * — it defaults to gen_random_uuid().
 *
 * Strategy: one transaction — TRUNCATE, then COPY (a full reseed of a
 * reference table; nothing to preserve). ON_ERROR_STOP aborts (and
 * rolls back) on any failure. COPY over one direct Postgres connection
 * sidesteps the PostgREST/HTTP flakiness of batched API upserts.
 *
 * The library is produced by `npm run waffle:generate` (committed
 * artifact); this just loads it.
 *
 * Connection: SUPABASE_DB_URL (defaults to the local stack). Requires
 * psql + gzip on PATH.
 *
 * Usage:  npm run waffle:import
 */

import { execFileSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const DB_URL =
  process.env.SUPABASE_DB_URL ??
  'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PUZZLES_PATH = resolve(__dirname, '../data/waffle-puzzles.tsv.gz')

const sql = `
\\set ON_ERROR_STOP on
begin;
truncate waffle.puzzles;
\\copy waffle.puzzles (solution, scramble, par_swaps, title) from program 'gzip -dc ''${PUZZLES_PATH}''' with (format text, null '\\N')
commit;
select count(*) || ' puzzles loaded' as result from waffle.puzzles;
`

const safeTarget = DB_URL.replace(/:[^:@/]*@/, ':****@')
console.log(`Loading ${PUZZLES_PATH}`)
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
