#!/usr/bin/env -S npx tsx
/**
 * Seed `common.words` — the master playable-word list shared by
 * every word game — from the vendored, gzipped TSV at
 * `supabase/data/words.tsv.gz` using psql `COPY`.
 *
 * The TSV is one row per playable word with the columns, in order:
 *
 *   word  difficulty  american british canadian australian  slur
 *   slang  wordle  len  root_word  definition  definition_source
 *
 * tab-separated, `\N` for NULLs, `t`/`f` for booleans — exactly the
 * Postgres text COPY format, so there's NOTHING to process in TS:
 * psql streams the file straight into the table. `letter_mask` is a
 * GENERATED column (`common.word_letter_mask(word)`), so it's omitted
 * from the COPY column list and Postgres fills it per row.
 *
 * The file is gzipped (14 MB raw → ~3 MB) because that's a lot of
 * rows to keep uncompressed in git; `\copy ... FROM PROGRAM 'gzip
 * -dc ...'` decompresses on the client and pipes the stream into the
 * COPY without an intermediate temp file.
 *
 * Strategy: one transaction — TRUNCATE, then COPY. A full reseed of a
 * reference table; there's nothing to preserve. ON_ERROR_STOP aborts
 * (and rolls back) on any failure, so a partial load can't leave the
 * table half-empty. COPY over ONE direct Postgres connection sidesteps
 * the PostgREST/HTTP flakiness that batched API upserts hit against
 * hosted projects.
 *
 * Connection: `SUPABASE_DB_URL`, a Postgres connection string.
 * Defaults to the local stack. The deploy script (import-to-hosted.sh)
 * sets it to the hosted project's connection.
 *
 * Requires `psql` and `gzip` on PATH.
 *
 * Usage:  npm run words:import
 */

import { execFileSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const DB_URL =
  process.env.SUPABASE_DB_URL ??
  'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

const __dirname = dirname(fileURLToPath(import.meta.url))
const WORDS_PATH = resolve(__dirname, '../data/words.tsv.gz')

// Column list matches the TSV's column order. `letter_mask` is
// deliberately absent — it's GENERATED ALWAYS, so COPY must not
// supply a value for it.
//
// Quoting note: the PROGRAM string is single-quoted for psql; a
// literal single quote inside it is doubled (''), which is how the
// vendored path ends up shell-quoted too.
const sql = `
\\set ON_ERROR_STOP on
begin;
truncate common.words;
\\copy common.words (word, difficulty, american, british, canadian, australian, slur, slang, wordle, len, root_word, definition, definition_source) from program 'gzip -dc ''${WORDS_PATH}''' with (format text, null '\\N')
commit;
select count(*) || ' words loaded' as result from common.words;
`

// Mask the password when echoing the target, so a connection string
// never lands in logs / CI output.
const safeTarget = DB_URL.replace(/:[^:@/]*@/, ':****@')
console.log(`Loading ${WORDS_PATH}`)
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
