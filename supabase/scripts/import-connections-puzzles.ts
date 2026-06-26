#!/usr/bin/env -S npx tsx
/**
 * Import the NYT Connections puzzle archive into
 * `connections.puzzles`.
 *
 * Source: https://github.com/Eyefyre/NYT-Connections-Answers —
 * a community-maintained JSON file of every Connections puzzle,
 * updated daily by a scraper. The file's shape (one record per
 * day):
 *
 *     {
 *       "id": 1,                       // NYT puzzle number
 *       "date": "2023-06-12",
 *       "answers": [
 *         { "level": 0, "group": "WET WEATHER",
 *           "members": ["HAIL","RAIN","SLEET","SNOW"] },
 *         ...
 *       ]
 *     }
 *
 * Our target shape is `connections.puzzles`:
 *
 *     { source_id: text,      // String(record.id)
 *       nyt_date:  date,      // record.date
 *       categories: jsonb }   // record.answers, normalized
 *
 * Mapping notes:
 *   - `level` is IGNORED — `answers[]` is always in rank-order,
 *     and NYT dropped the field in later puzzles. We use the
 *     array index as `rank` instead.
 *   - `group` → `name`
 *   - `members` → `tiles`
 *
 * Idempotency: every row is upserted on `source_id` with
 * ignoreDuplicates=true. Re-running the script is safe and only
 * inserts genuinely new puzzles. (If NYT ever rewrites a past
 * puzzle, we'd want a different policy — but Eyefyre's repo
 * doesn't historically rewrite, so this is fine for now.)
 *
 * Usage:
 *   npm run connections:import                       # fetches from GitHub
 *   npm run connections:import -- --file ./local.json   # offline
 *
 * Auth: uses the local Supabase service_role key by default
 * (matches `supabase status -o env`'s SERVICE_ROLE_KEY). Override
 * via SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY env vars for a
 * non-local target. Service-role bypasses RLS — required to
 * INSERT into `connections.puzzles`, which has no INSERT grant to
 * `authenticated`.
 *
 * For v1 this is run manually ("a little annoying" but
 * acceptable). It graduates to a scheduled Edge Function /
 * GitHub Action when that annoyance compounds.
 */

import { createClient } from '@supabase/supabase-js'
import { readFile } from 'node:fs/promises'

const SOURCE_URL =
  'https://raw.githubusercontent.com/Eyefyre/NYT-Connections-Answers/main/connections.json'

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321'
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY
  // Local-dev default — the well-known service_role key emitted
  // by `supabase status`. Anything other than localhost should
  // set the env var explicitly.
  ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

/** The shape we expect each record in `connections.json` to have. */
type UpstreamRecord = {
  id: number
  date: string
  answers: Array<{
    /** Sometimes missing in later entries — we don't read this
     *  field. Array index drives rank instead. */
    level?: number
    group: string
    members: string[]
  }>
}

/** The shape we insert into `connections.puzzles.categories`. */
type Category = {
  rank: 0 | 1 | 2 | 3
  name: string
  tiles: string[]
}

type PuzzleRow = {
  source_id: string
  nyt_date: string
  categories: Category[]
}

async function loadUpstream(filePath: string | null): Promise<UpstreamRecord[]> {
  if (filePath) {
    console.log(`Reading from local file: ${filePath}`)
    const raw = await readFile(filePath, 'utf8')
    return JSON.parse(raw)
  }
  console.log(`Fetching ${SOURCE_URL}`)
  const res = await fetch(SOURCE_URL)
  if (!res.ok) {
    throw new Error(`Upstream fetch failed: ${res.status} ${res.statusText}`)
  }
  return await res.json()
}

/** One-record sanity check before we trust the whole array. If
 *  the upstream shape ever changes, fail fast with a clear
 *  message rather than silently corrupting the import. */
function validateShape(record: unknown): asserts record is UpstreamRecord {
  if (typeof record !== 'object' || record === null) {
    throw new Error('first record is not an object')
  }
  const r = record as Record<string, unknown>
  if (typeof r.id !== 'number') {
    throw new Error(`first record missing numeric "id"; got ${typeof r.id}`)
  }
  if (typeof r.date !== 'string') {
    throw new Error(`first record missing string "date"; got ${typeof r.date}`)
  }
  if (!Array.isArray(r.answers) || r.answers.length !== 4) {
    throw new Error(
      `first record's "answers" must be an array of 4; got ${
        Array.isArray(r.answers) ? `array of ${r.answers.length}` : typeof r.answers
      }`,
    )
  }
  for (const [i, ans] of r.answers.entries()) {
    if (typeof ans !== 'object' || ans === null) {
      throw new Error(`first record's answers[${i}] is not an object`)
    }
    const a = ans as Record<string, unknown>
    if (typeof a.group !== 'string') {
      throw new Error(`first record's answers[${i}].group must be string`)
    }
    if (
      !Array.isArray(a.members)
      || a.members.length !== 4
      || a.members.some((m) => typeof m !== 'string')
    ) {
      throw new Error(`first record's answers[${i}].members must be array of 4 strings`)
    }
  }
}

function toPuzzleRow(record: UpstreamRecord): PuzzleRow {
  return {
    source_id: String(record.id),
    nyt_date: record.date,
    categories: record.answers.map((ans, rank) => ({
      // Rank derived from array index per Joel's note: NYT dropped
      // `level` in later puzzles but `answers[]` is always
      // rank-ordered, so the index is the canonical source.
      rank: rank as 0 | 1 | 2 | 3,
      name: ans.group,
      tiles: ans.members,
    })),
  }
}

async function main() {
  const args = process.argv.slice(2)
  const fileFlagIndex = args.indexOf('--file')
  const filePath = fileFlagIndex >= 0 ? args[fileFlagIndex + 1] ?? null : null

  const upstream = await loadUpstream(filePath)
  if (!Array.isArray(upstream) || upstream.length === 0) {
    throw new Error('upstream payload was empty or not an array')
  }
  validateShape(upstream[0])
  console.log(`Loaded ${upstream.length} upstream records.`)

  const rows = upstream.map(toPuzzleRow)

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    db: { schema: 'connections' },
    auth: { persistSession: false },
  })

  // Bulk upsert with ignoreDuplicates so re-runs are no-ops on
  // already-imported rows. Connections is small enough (~1000
  // puzzles) that one batch is fine.
  const { data, error } = await supabase
    .from('puzzles')
    .upsert(rows, {
      onConflict: 'source_id',
      ignoreDuplicates: true,
    })
    .select('id')
  if (error) {
    console.error('upsert failed:', error.message)
    process.exit(1)
  }

  const inserted = data?.length ?? 0
  const skipped = rows.length - inserted
  console.log(
    `Done. ${inserted} new puzzle${inserted === 1 ? '' : 's'} imported, ${skipped} already present.`,
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
