#!/usr/bin/env -S npx tsx
/**
 * Fetch NYT Strands puzzles into the local archive file
 * `supabase/data/strands-puzzles.jsonl`. **This is the only script that talks
 * to nytimes.com.**
 *
 * Why the split. The importer used to fetch every puzzle on every run, which
 * meant a `gmake db ENV=local` — a routine, frequent operation — fired ~900
 * requests at someone else's endpoint. That is rude at best and a way to get
 * blocked at worst. So the network step is now separate, incremental, and rare:
 * the archive lives on disk, database resets read from it, and this runs only
 * when there are genuinely new puzzles to pick up. Same shape as stackdown's
 * generate-then-import split.
 *
 * Incremental by construction: dates already in the file are never re-fetched,
 * so a daily top-up costs one request. NYT publishes one puzzle per day with no
 * gaps in the archive so far.
 *
 * Source: https://www.nytimes.com/svc/strands/v2/YYYY-MM-DD.json — PUBLIC, no
 * auth (unlike the NYT crossword endpoint, which needs a cookie jar in a
 * secret). Out-of-range dates 404 cleanly. The archive starts 2024-03-04.
 *
 * The feed also ships `solutions` — NYT's own 600–1300 valid non-theme words
 * per board. Deliberately NOT stored: our hint words come from `common.words`
 * at the game's difficulty band, and that band IS the difficulty lever, whereas
 * NYT's list is Collins-flavored (ADAW, AESC, ALAP) and doesn't match how the
 * rest of the roster reads. It stays useful as a TEST FIXTURE — a free parity
 * oracle for the tracer, the way boggle-c-solver/ is for boggle's solver — but
 * a fixture is a checked-in sample, not 900 puzzles' worth of dead weight.
 *
 * Usage:
 *   npm run _strands:fetch                       # anything new → today
 *   npm run _strands:fetch -- --to 2026-08-01    # stop earlier
 *   npm run _strands:fetch -- --from 2025-01-01 --force   # re-fetch a range
 *   (public entry: `gmake g-strands-fetch`)
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import {
  toPuzzleRow,
  type Feed,
  type PuzzleRow,
} from './lib/strandsPuzzle'

const ARCHIVE = 'supabase/data/strands-puzzles.jsonl'
/** First published Strands puzzle. Earlier dates 404. */
const ARCHIVE_START = '2024-03-04'
const FEED = (date: string) => `https://www.nytimes.com/svc/strands/v2/${date}.json`

/**
 * Deliberately gentle. This is a guest on someone else's endpoint, and since
 * the archive is now cached on disk this loop runs rarely and usually for a
 * single day — so there is nothing to gain from being fast, and a modest
 * concurrency plus a small pause is cheap insurance against looking like abuse.
 */
const CONCURRENCY = 3
const PAUSE_MS = 120

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

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

/** Read the archive. A missing file is normal on a fresh clone. */
async function readArchive(): Promise<PuzzleRow[]> {
  try {
    const raw = await readFile(ARCHIVE, 'utf8')
    return raw.split('\n').filter(Boolean).map((l) => JSON.parse(l) as PuzzleRow)
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw e
  }
}

/** Fetch one date. `null` = no puzzle there (404 / non-OK), normal at the edges. */
async function fetchDate(date: string): Promise<PuzzleRow | null> {
  const res = await fetch(FEED(date))
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`${date}: fetch failed ${res.status} ${res.statusText}`)
  const json = (await res.json()) as Feed
  if (json.status !== 'OK') return null
  return toPuzzleRow(json, date)
}

/** Map over `items` with at most `limit` in flight, pausing between requests. */
async function pooled<T, R>(items: T[], limit: number, fn: (i: T) => Promise<R>): Promise<R[]> {
  const out: R[] = []
  let cursor = 0
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (cursor < items.length) {
        const i = cursor++
        out.push(await fn(items[i]))
        await sleep(PAUSE_MS)
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
  const to = flag(args, 'to') ?? new Date().toISOString().slice(0, 10)
  const force = args.includes('--force')

  const existing = await readArchive()
  const known = new Set(existing.map((r) => r.puzzle_date))
  // Default start: the day after the newest puzzle we hold, so the common case
  // (a daily top-up) walks one date rather than the whole archive.
  const newest = existing.reduce((m, r) => (r.puzzle_date > m ? r.puzzle_date : m), '')
  const from = flag(args, 'from')
    ?? (newest && !force ? new Date(`${newest}T00:00:00Z`).toISOString().slice(0, 10) : ARCHIVE_START)

  let wanted = dateRange(from, to)
  if (!force) wanted = wanted.filter((d) => !known.has(d))

  console.log(`strands archive: ${existing.length} on disk; checking ${from} → ${to}`)
  if (wanted.length === 0) {
    console.log('Up to date — no requests made.')
    return
  }
  console.log(`fetching ${wanted.length} date(s) from nytimes.com…`)

  const fetched: PuzzleRow[] = []
  let missing = 0
  const results = await pooled(wanted, CONCURRENCY, async (date) => {
    try {
      return await fetchDate(date)
    } catch (e) {
      // A malformed puzzle fails the whole run: it means either the feed
      // changed shape or our invariants are wrong, and both want a human.
      console.error(String(e instanceof Error ? e.message : e))
      process.exit(1)
    }
  })
  for (const r of results) {
    if (r) fetched.push(r)
    else missing++
  }

  // Merge by date, newest write winning, then sort — so --force re-fetches
  // replace rather than duplicate, and the file stays chronological.
  const byDate = new Map(existing.map((r) => [r.puzzle_date, r]))
  for (const r of fetched) byDate.set(r.puzzle_date, r)
  const merged = [...byDate.values()].sort((a, b) => a.puzzle_date.localeCompare(b.puzzle_date))

  await mkdir(dirname(ARCHIVE), { recursive: true })
  await writeFile(ARCHIVE, merged.map((r) => JSON.stringify(r)).join('\n') + '\n')

  console.log(
    `✓ ${ARCHIVE}: ${merged.length} puzzles (+${merged.length - existing.length} new`
    + `${missing ? `, ${missing} date(s) had none` : ''})`,
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
