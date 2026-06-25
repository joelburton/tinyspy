#!/usr/bin/env -S npx tsx
/**
 * Load the vendored StackDown board library into `stackdown.boards` —
 * `npm run stackdown:import`. Reads `supabase/data/stackdown-boards.jsonl`
 * (produced by `npm run stackdown:gen`) and replaces the table's
 * contents with it.
 *
 * This is the CHEAP, fast half of the split (the slow generation is
 * `stackdown:gen`, run rarely; its output is committed to git). Run this
 * after every `db:reset` — a reset wipes `stackdown.boards` (it's a plain
 * table, not seeded by migrations), and `stackdown.create_game` raises if
 * the library is empty.
 *
 * Strategy: one transaction — DELETE all, then INSERT the file's boards.
 * A full reseed; nothing to preserve. `delete` (not `truncate`) so the
 * `on delete set null` on `stackdown.games.board_id` keeps the FK happy
 * if any games already reference a board.
 *
 * Connection: `SUPABASE_DB_URL` (defaults to the local stack). Requires
 * `psql` on PATH.
 *
 * Usage:  npm run stackdown:import
 */

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const DB_URL =
  process.env.SUPABASE_DB_URL ??
  'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BOARDS_FILE = resolve(__dirname, '../data/stackdown-boards.jsonl')

type BoardLine = { tiles: unknown; words: string[]; wordlist?: number }

if (!existsSync(BOARDS_FILE)) {
  console.error(
    `No board file at ${BOARDS_FILE} — run \`npm run stackdown:gen\` first.`,
  )
  process.exit(1)
}

const boards: BoardLine[] = readFileSync(BOARDS_FILE, 'utf8')
  .trim()
  .split('\n')
  .filter(Boolean)
  .map((line) => JSON.parse(line) as BoardLine)

if (boards.length === 0) {
  console.error(`${BOARDS_FILE} is empty — run \`npm run stackdown:gen\` first.`)
  process.exit(1)
}

// Build the INSERT VALUES list. Letters/words are A–Z so no escaping is
// needed beyond doubling single quotes in the (quote-free) tiles JSON.
// Solution words are stored LOWERCASE to match common.words (and the
// rest of the app's "store lowercase, display uppercase" convention) —
// normalized here so the generated file's case doesn't matter. Tile
// letters stay uppercase (they're board glyphs, rendered as-is).
const values = boards
  .map((b) => {
    const tilesJson = JSON.stringify(b.tiles).replace(/'/g, "''")
    const wordsArr = `array[${b.words.map((w) => `'${w.toLowerCase()}'`).join(',')}]`
    return `('${tilesJson}'::jsonb, ${wordsArr}, ${b.wordlist ?? 0})`
  })
  .join(',\n')

const sql = `\\set ON_ERROR_STOP on
begin;
delete from stackdown.boards;
insert into stackdown.boards (tiles, words, wordlist) values
${values};
commit;
select count(*) || ' boards loaded into the library' as result from stackdown.boards;
`

const safeTarget = DB_URL.replace(/:[^:@/]*@/, ':****@')
console.log(`Loading ${boards.length} board(s) from ${BOARDS_FILE}`)
console.log(`  into ${safeTarget}`)
execFileSync('psql', [DB_URL], { input: sql, stdio: ['pipe', 'inherit', 'inherit'] })
