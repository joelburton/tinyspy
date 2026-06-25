#!/usr/bin/env -S npx tsx
/**
 * Seed `common.words` — the master playable-word list shared by every
 * word game — directly from the word-list project's working copy at
 * `~/src/gamelist/words.tsv`, via psql `COPY`.
 *
 * Why read the source directly (rather than a vendored snapshot in this
 * repo): the word list and this app are developed in tandem, and a
 * vendored copy silently DRIFTS — you tweak the list over there, forget
 * to re-vendor here, and reload stale data without noticing. Pointing
 * the importer straight at the gamelist working file makes that
 * impossible: `words:import` always loads exactly what's on disk there.
 * Override the location with the `WORDS_TSV` env var (another checkout,
 * a different machine, CI).
 *
 * The TSV is one row per playable word with the columns, in order:
 *
 *   word  difficulty  american british canadian australian  crude slur
 *   slang  wordle  len  root_word  definition  definition_source  hint
 *
 * tab-separated, `\N` for NULLs, `t`/`f` for booleans — exactly the
 * Postgres text COPY format, so there's NOTHING to process in TS:
 * psql's `\copy` streams the file straight into the table. `letter_mask`
 * is a GENERATED column (`common.word_letter_mask(word)`), so it's
 * omitted from the COPY column list and Postgres fills it per row.
 *
 * Strategy: one transaction — TRUNCATE, then COPY. A full reseed of a
 * reference table; there's nothing to preserve. ON_ERROR_STOP aborts
 * (and rolls back) on any failure, so a partial load can't leave the
 * table half-empty. COPY over ONE direct Postgres connection sidesteps
 * the PostgREST/HTTP flakiness that batched API upserts hit against
 * hosted projects.
 *
 * Connection: `SUPABASE_DB_URL`, a Postgres connection string. Defaults
 * to the local stack; the deploy script (import-to-hosted.sh) sets it to
 * the hosted project's connection — so the hosted load pulls from the
 * SAME gamelist source, with no separate vendored file to keep in sync.
 *
 * Requires `psql` on PATH and the words file present (build it in the
 * gamelist project first).
 *
 * Usage:  npm run words:import
 */

import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve } from 'node:path'

const DB_URL =
  process.env.SUPABASE_DB_URL ??
  'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

// The word list's working copy — developed alongside this app, read
// live so it can never drift from the source. Override with WORDS_TSV.
const WORDS_PATH =
  process.env.WORDS_TSV ?? resolve(homedir(), 'src/gamelist/words.tsv')

if (!existsSync(WORDS_PATH)) {
  console.error(
    `Word list not found at ${WORDS_PATH}.\n` +
      `Build it in the gamelist project first, or set WORDS_TSV to its path.`,
  )
  process.exit(1)
}

// Column list matches the TSV's column order. `letter_mask` is
// deliberately absent — it's GENERATED ALWAYS, so COPY must not supply
// a value for it. The path is single-quoted for `\copy`; home-dir paths
// are quote-free so no escaping is needed.
const sql = `
\\set ON_ERROR_STOP on
begin;
truncate common.words;
\\copy common.words (word, difficulty, american, british, canadian, australian, crude, slur, slang, wordle, len, root_word, definition, definition_source, hint) from '${WORDS_PATH}' with (format text, null '\\N')
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
