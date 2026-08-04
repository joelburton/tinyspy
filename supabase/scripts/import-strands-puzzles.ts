#!/usr/bin/env -S npx tsx
/**
 * Load `strands.puzzles` from the local archive file
 * `supabase/data/strands-puzzles.jsonl`.
 *
 * **No network.** Every puzzle comes off disk, which is the whole point of the
 * split: `gmake db ENV=local` is routine and frequent, and it used to fire ~900
 * requests at nytimes.com each time. Fetching now lives in its own rare,
 * incremental step (`gmake g-strands-fetch` → fetch-strands-puzzles.ts); this
 * half only ever reads what that produced.
 *
 * The archive is re-validated on the way in — same `validatePuzzle` the fetcher
 * ran — because a hand-edited or half-written file should fail loudly rather
 * than land in a table. Cheap: ~900 puzzles of pure array walking.
 *
 * Idempotent: upserts on `source_id` with ignoreDuplicates, so re-running is a
 * no-op on rows already present.
 *
 * Usage:
 *   npm run _strands:import
 *   (public entry: `gmake g-strands-puzzles ENV=…`)
 *
 * Auth: local service_role key by default (service-role bypasses RLS, required
 * because `strands.puzzles` grants no INSERT to `authenticated`). Override with
 * SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY for a non-local target.
 */

import { readFile } from 'node:fs/promises'
import { createClient } from '@supabase/supabase-js'
import { rowAsFeed, validatePuzzle, type PuzzleRow } from './lib/strandsPuzzle'

const ARCHIVE = 'supabase/data/strands-puzzles.jsonl'

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321'
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY
  ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

async function main() {
  let raw: string
  try {
    raw = await readFile(ARCHIVE, 'utf8')
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
      // The Makefile's file rule normally fetches before we get here; this is
      // the message for someone running the npm script directly.
      console.error(
        `${ARCHIVE} is missing. Run \`gmake g-strands-fetch\` to build it from the NYT archive.`,
      )
      process.exit(1)
    }
    throw e
  }

  const rows = raw.split('\n').filter(Boolean).map((line, i) => {
    let row: PuzzleRow
    try {
      row = JSON.parse(line) as PuzzleRow
    } catch {
      console.error(`${ARCHIVE}:${i + 1}: not valid JSON`)
      process.exit(1)
    }
    try {
      validatePuzzle(rowAsFeed(row), `${ARCHIVE}:${i + 1} (${row.puzzle_date})`)
    } catch (err) {
      console.error(String(err instanceof Error ? err.message : err))
      process.exit(1)
    }
    return row
  })

  if (rows.length === 0) {
    console.log(`${ARCHIVE} is empty — nothing to import.`)
    return
  }
  console.log(`Loaded ${rows.length} puzzles from ${ARCHIVE} (validated).`)

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    db: { schema: 'strands' },
    auth: { persistSession: false },
  })

  // Batched so a full ~900-puzzle load doesn't build one enormous request body.
  // UPDATE on conflict (not ignoreDuplicates): "the archive can be re-imported
  // freely" is the library-puzzle promise, and it includes a re-fetch carrying
  // a corrected puzzle — games in flight are untouched either way, since every
  // game plays from its own frozen copy.
  const BATCH = 200
  let upserted = 0
  for (let i = 0; i < rows.length; i += BATCH) {
    const { data, error } = await supabase
      .from('puzzles')
      .upsert(rows.slice(i, i + BATCH), { onConflict: 'source_id' })
      .select('id')
    if (error) {
      console.error('upsert failed:', error.message)
      process.exit(1)
    }
    upserted += data?.length ?? 0
  }

  console.log(`✓ upserted ${upserted} puzzles (inserted or refreshed in place)`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
