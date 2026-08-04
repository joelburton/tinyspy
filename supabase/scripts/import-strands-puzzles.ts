#!/usr/bin/env -S npx tsx
/**
 * Import the NYT Strands puzzle archive into `strands.puzzles`.
 *
 * Source: https://www.nytimes.com/svc/strands/v2/YYYY-MM-DD.json —
 * one request per date, and PUBLIC: unlike the NYT crossword
 * endpoint (which needs a cookie jar in a secret), this needs no
 * auth at all. Out-of-range dates 404 cleanly.
 *
 * The feed's shape, of which we keep five fields:
 *
 *     { "status": "OK",
 *       "id": 636,
 *       "printDate": "2025-06-15",
 *       "clue": "Here's to him!",
 *       "startingBoard": ["ARCPAP", "WDZARA", …8 rows of 6],
 *       "themeWords": ["CHALUPA", …],
 *       "spangram": "FATHERSDAY",
 *       "themeCoords": { "CHALUPA": [[2,4],[2,5],…], … },
 *       "spangramCoords": [[4,0],[3,0],…],
 *       "solutions": [ …600–1300 valid non-theme words… ] }
 *
 * `solutions` is deliberately NOT imported. Our hint words come from
 * `common.words` at the game's difficulty band — that band IS the
 * difficulty lever — and NYT's list is Collins-flavored (ADAW, AESC,
 * ALAP), which doesn't match how the rest of the roster reads. It's
 * still useful as a TEST FIXTURE: it's a free parity oracle for the
 * tracer, the way boggle-c-solver/ is for boggle's solver. All 1168
 * solutions in one sampled puzzle traced under 8-way/no-reuse, which
 * is how the adjacency rule was confirmed in the first place.
 *
 * Incremental: dates already in the table are skipped without being
 * fetched, so a re-run costs one query plus whatever is genuinely new.
 *
 * Usage:
 *   npm run _strands:import                    # archive start → today
 *   npm run _strands:import -- --from 2025-01-01 --to 2025-01-31
 *   npm run _strands:import -- --limit 20      # cap the fetch count
 *   npm run _strands:import -- --force         # re-fetch known dates
 *   (public entry: `gmake g-strands-puzzles ENV=…`)
 *
 * Auth: local service_role key by default (service-role bypasses RLS,
 * required because `strands.puzzles` grants no INSERT to
 * `authenticated`). Override with SUPABASE_URL +
 * SUPABASE_SERVICE_ROLE_KEY for a non-local target.
 */

import { createClient } from '@supabase/supabase-js'

/** First published Strands puzzle. Earlier dates 404. */
const ARCHIVE_START = '2024-03-04'
const FEED = (date: string) => `https://www.nytimes.com/svc/strands/v2/${date}.json`

/** Board geometry. Fixed by the game, and asserted on every import. */
const ROWS = 8
const COLS = 6
const CELLS = ROWS * COLS

/** Polite concurrency against nytimes.com — this walks ~1000 dates on
 *  a cold import, and we are a guest on someone else's endpoint. */
const CONCURRENCY = 6

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321'
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY
  ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

type Coord = [number, number]

/** The upstream record, narrowed to what we read. */
type Feed = {
  status: string
  id: number
  printDate: string
  clue: string
  startingBoard: string[]
  themeWords: string[]
  spangram: string
  themeCoords: Record<string, Coord[]>
  spangramCoords: Coord[]
}

/** What lands in `strands.puzzles.solution` — the answer key. */
type Solution = {
  spangram: { word: string; coords: Coord[] }
  themeWords: Array<{ word: string; coords: Coord[] }>
}

type PuzzleRow = {
  source_id: string
  puzzle_date: string
  board: string[]
  clue: string
  solution: Solution
}

/** Two cells are adjacent iff they touch on any of the 8 sides or
 *  corners — diagonals included. Verified against the real archive:
 *  every sampled puzzle uses diagonal steps, so a 4-way rule would
 *  reject most genuine answers. */
function adjacent([r1, c1]: Coord, [r2, c2]: Coord): boolean {
  const dr = Math.abs(r1 - r2)
  const dc = Math.abs(c1 - c2)
  return (dr | dc) !== 0 && dr <= 1 && dc <= 1
}

/**
 * Reject anything that isn't a well-formed puzzle, loudly and with the
 * date attached. This is the import guard, and it is the only place
 * the board invariants are checked end to end — the table's CHECKs can
 * only see shape, not whether the coords tell the truth.
 *
 * Four things are verified, in increasing order of interestingness:
 *
 *  1. the board is 8 rows of 6;
 *  2. every path is contiguous under 8-way adjacency and never
 *     revisits a cell;
 *  3. every path actually SPELLS its word on this board — the check
 *     that would catch a feed change silently shifting coordinate
 *     order to [col,row];
 *  4. the theme words plus the spangram TILE the board exactly: all
 *     48 cells, each covered once. That's the invariant the whole
 *     gametype leans on (win = board consumed; found tiles lock), so
 *     a puzzle violating it is malformed and must not be imported.
 */
function validate(f: Feed, date: string): void {
  const bad = (msg: string): never => {
    throw new Error(`${date}: ${msg}`)
  }

  if (!Array.isArray(f.startingBoard) || f.startingBoard.length !== ROWS) {
    bad(`board must be ${ROWS} rows, got ${f.startingBoard?.length}`)
  }
  for (const [i, row] of f.startingBoard.entries()) {
    if (typeof row !== 'string' || row.length !== COLS) {
      bad(`board row ${i} must be ${COLS} letters, got ${JSON.stringify(row)}`)
    }
  }
  if (typeof f.spangram !== 'string' || !f.spangram) bad('missing spangram')
  if (!Array.isArray(f.themeWords) || f.themeWords.length === 0) bad('missing themeWords')
  if (typeof f.clue !== 'string') bad('missing clue')

  const entries: Array<{ word: string; coords: Coord[] }> = [
    { word: f.spangram, coords: f.spangramCoords },
    ...f.themeWords.map((w) => ({ word: w, coords: f.themeCoords?.[w] })),
  ]

  const seen = new Set<string>()
  for (const { word, coords } of entries) {
    if (!Array.isArray(coords)) bad(`no coords for ${word}`)
    if (coords.length !== word.length) {
      bad(`${word}: ${coords.length} coords for ${word.length} letters`)
    }
    coords.forEach(([r, c], i) => {
      if (!Number.isInteger(r) || !Number.isInteger(c) || r < 0 || r >= ROWS || c < 0 || c >= COLS) {
        bad(`${word}: coord ${i} out of range: ${JSON.stringify(coords[i])}`)
      }
      // (3) the path spells the word — catches a coordinate-order flip.
      if (f.startingBoard[r][c] !== word[i]) {
        bad(`${word}: coord ${i} [${r},${c}] is "${f.startingBoard[r][c]}", expected "${word[i]}"`)
      }
      // (2) contiguity under 8-way adjacency.
      if (i > 0 && !adjacent(coords[i - 1], coords[i])) {
        bad(`${word}: ${JSON.stringify(coords[i - 1])} → ${JSON.stringify(coords[i])} not adjacent`)
      }
      // (4a) no cell used twice, within a word or across words.
      const key = `${r},${c}`
      if (seen.has(key)) bad(`cell [${r},${c}] used more than once (at ${word}[${i}])`)
      seen.add(key)
    })
  }

  // (4b) …and every cell used at all.
  if (seen.size !== CELLS) {
    bad(`theme words cover ${seen.size}/${CELLS} cells — the board must tile exactly`)
  }
}

function toRow(f: Feed, date: string): PuzzleRow {
  validate(f, date)
  return {
    source_id: String(f.id),
    puzzle_date: f.printDate ?? date,
    board: f.startingBoard,
    clue: f.clue,
    solution: {
      spangram: { word: f.spangram, coords: f.spangramCoords },
      themeWords: f.themeWords.map((w) => ({ word: w, coords: f.themeCoords[w] })),
    },
  }
}

/** Every ISO date from `from` to `to` inclusive. */
function dateRange(from: string, to: string): string[] {
  const out: string[] = []
  const d = new Date(`${from}T00:00:00Z`)
  const end = new Date(`${to}T00:00:00Z`)
  while (d <= end) {
    out.push(d.toISOString().slice(0, 10))
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return out
}

/** Fetch one date. `null` means "no puzzle here" (404 / non-OK status),
 *  which is normal at the archive edges and not an error. */
async function fetchDate(date: string): Promise<PuzzleRow | null> {
  const res = await fetch(FEED(date))
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`${date}: fetch failed ${res.status} ${res.statusText}`)
  const json = (await res.json()) as Feed
  if (json.status !== 'OK') return null
  return toRow(json, date)
}

/** Map over `items` with at most `limit` in flight. Order of results
 *  doesn't matter here (we upsert as a set), so this is a simple pool
 *  of workers pulling from a shared cursor. */
async function pooled<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = []
  let cursor = 0
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (cursor < items.length) {
        const i = cursor++
        out.push(await fn(items[i]))
      }
    }),
  )
  return out
}

function flag(args: string[], name: string): string | null {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] ?? null : null
}

async function main() {
  const args = process.argv.slice(2)
  const from = flag(args, 'from') ?? ARCHIVE_START
  const to = flag(args, 'to') ?? new Date().toISOString().slice(0, 10)
  const limit = Number(flag(args, 'limit') ?? 0)
  const force = args.includes('--force')

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    db: { schema: 'strands' },
    auth: { persistSession: false },
  })

  // Incremental: ask what we already have before touching the network.
  const known = new Set<string>()
  if (!force) {
    const { data, error } = await supabase.from('puzzles').select('puzzle_date')
    if (error) {
      console.error('could not read existing puzzles:', error.message)
      process.exit(1)
    }
    for (const r of data ?? []) known.add(r.puzzle_date as string)
  }

  let wanted = dateRange(from, to).filter((d) => !known.has(d))
  if (limit > 0) wanted = wanted.slice(0, limit)

  console.log(
    `strands: ${from} → ${to}; ${known.size} already imported, ${wanted.length} to fetch`,
  )
  if (wanted.length === 0) {
    console.log('Nothing to do.')
    return
  }

  let missing = 0
  const rows: PuzzleRow[] = []
  const results = await pooled(wanted, CONCURRENCY, async (date) => {
    try {
      return await fetchDate(date)
    } catch (e) {
      // A malformed puzzle is worth failing the whole run over — it
      // means either the feed changed shape or our invariants are
      // wrong, and both want a human before ~1000 rows land.
      console.error(String(e instanceof Error ? e.message : e))
      process.exit(1)
    }
  })
  for (const r of results) {
    if (r) rows.push(r)
    else missing++
  }

  console.log(`fetched ${rows.length} puzzles (${missing} dates had none)`)
  if (rows.length === 0) return

  // Batched so a cold ~1000-puzzle import doesn't build one enormous
  // request body; ignoreDuplicates makes re-runs no-ops.
  const BATCH = 200
  let inserted = 0
  for (let i = 0; i < rows.length; i += BATCH) {
    const { data, error } = await supabase
      .from('puzzles')
      .upsert(rows.slice(i, i + BATCH), { onConflict: 'source_id', ignoreDuplicates: true })
      .select('id')
    if (error) {
      console.error('upsert failed:', error.message)
      process.exit(1)
    }
    inserted += data?.length ?? 0
  }

  console.log(`✓ inserted ${inserted}, skipped ${rows.length - inserted} already present`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
