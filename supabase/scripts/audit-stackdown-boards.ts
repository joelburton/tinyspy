#!/usr/bin/env -S npx tsx
/**
 * Audit the committed stackdown board library against the CURRENT
 * dictionary filter.
 *
 * Why this exists rather than a rebuild: the boards in
 * `supabase/data/stackdown-boards.jsonl` were generated against
 * `common.words` as it stood on some earlier day. When the word list
 * changes — a word re-rated, a filter tightened — boards holding a
 * now-excluded word don't become *broken*: they're still solvable, the
 * geometry is still valid, the six words are still real English. They're
 * just words we'd no longer choose. Regenerating the library is slow
 * (~10s/board with the strict no-trap validation), so whether to rebuild
 * is a judgment call each time, and this tells you the size of it.
 *
 * The precedent: on 2026-08-03 `not slang` joined the generator's filter
 * and this check found 92 of 1204 boards affected — worth regenerating.
 * A one-word re-rating usually isn't.
 *
 * The filter mirrors generate-stackdown-boards.ts exactly. If you change
 * one, change the other — they're the same rule stated twice, once to
 * BUILD boards and once to JUDGE them.
 *
 * Connection: SUPABASE_DB_URL (defaults to the local stack). Needs psql
 * and a populated common.words.
 *
 * Usage:  gmake stackdown-audit          (or: npx tsx this-file.ts)
 * Exit:   0 = clean, 1 = boards affected (so it can gate a script)
 */

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const DB_URL =
  process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
const BOARDS_FILE = resolve(import.meta.dirname, '../data/stackdown-boards.jsonl')

type BoardLine = { tiles: unknown[]; words: string[]; band: number }

const boards: BoardLine[] = readFileSync(BOARDS_FILE, 'utf8')
  .trim()
  .split('\n')
  .filter(Boolean)
  .map((l) => JSON.parse(l) as BoardLine)

// The generator's lexicon rule, per band: clean 5-letter american words
// at EXACTLY that difficulty. A board word that no longer satisfies its
// own band's rule is what we're looking for.
const rows = execFileSync(
  'psql',
  ['-X', '-tAF', '\t', '-d', DB_URL, '-c',
   `select difficulty, word from common.words
     where slur = 0 and crude = 0 and american and not slang and len = 5`],
  { encoding: 'utf8', maxBuffer: 1 << 26 },
)
  .split('\n')
  .filter(Boolean)
  .map((l) => l.split('\t') as [string, string])

const eligible = new Map<string, number>() // word → its band
for (const [band, word] of rows) eligible.set(word, Number(band))

const bad = new Map<string, string>() // word → why
const affected: BoardLine[] = []
for (const b of boards) {
  const offenders = b.words.filter((w) => {
    const band = eligible.get(w.toLowerCase())
    if (band === undefined) {
      bad.set(w.toLowerCase(), 'no longer passes the clean filter (or is gone)')
      return true
    }
    if (band !== b.band) {
      bad.set(w.toLowerCase(), `re-rated to band ${band}, board is band ${b.band}`)
      return true
    }
    return false
  })
  if (offenders.length) affected.push(b)
}

const byBand = new Map<number, number>()
for (const b of affected) byBand.set(b.band, (byBand.get(b.band) ?? 0) + 1)

console.log(`stackdown board audit — ${boards.length} boards, ${bad.size} suspect word(s)`)
if (!affected.length) {
  console.log('Clean: every board word still passes the filter at its own band.')
  process.exit(0)
}
console.log(`\n${affected.length} board(s) affected:`)
for (const [band, n] of [...byBand].sort()) console.log(`  band ${band}: ${n}`)
console.log('\nWords:')
for (const [w, why] of [...bad].sort()) console.log(`  ${w.padEnd(8)} ${why}`)
console.log(
  '\nThese boards are still SOLVABLE — this is a "would we pick these words today?"\n' +
    'judgment, not a bug. To rebuild: drop the affected lines, then\n' +
    '`gmake stackdown-genpuzzles COUNT=<n> BAND=<b>` to top back up, then `gmake stackdown-puzzles`.',
)
process.exit(1)
