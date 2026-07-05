#!/usr/bin/env -S npx tsx
/**
 * Import a folder of `.puz` / `.ipuz` files into `crosswords.puzzles` —
 * `npm run crosswords:import`. Wraps the stage-1 pure converter
 * (`crosswords/convert.ts`) and upserts each puzzle as `source = 'library'`,
 * deduped on `content_hash`.
 *
 * Source folder: `supabase/data/crosswords/` by default (git-IGNORED —
 * Joel keeps his own puzzle files there and never commits them; this also
 * sidesteps the copyright question NYT-derived files would raise), or a
 * path passed as the first argument. If the folder is missing or empty the
 * script is a clean no-op (so the aggregate `npm run import` and a
 * post-`db:reset` recovery don't fail when there are no local puzzles) —
 * same posture as the other library games, just with a local-only source.
 *
 * Auth: the local service_role key by default (bypasses RLS — required to
 * INSERT into crosswords.puzzles, which has no INSERT grant to
 * authenticated). Override SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY for a
 * non-local target.
 *
 * Usage:
 *   npm run crosswords:import                    # supabase/data/crosswords/
 *   npm run crosswords:import -- ./my-puzzles    # a different folder
 */

import { createClient } from '@supabase/supabase-js'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { convertPuzzleFile } from './crosswords/convert'
import { IpuzUnsupportedError } from './crosswords/ipuz'

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321'
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY
  // Local-dev default — the well-known service_role key from `supabase status`.
  ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DEFAULT_DIR = resolve(__dirname, '../data/crosswords')

async function main() {
  const dir = resolve(process.argv[2] ?? DEFAULT_DIR)

  if (!existsSync(dir)) {
    console.log(`No puzzle folder at ${dir} — nothing to import (this is fine).`)
    return
  }

  const files = readdirSync(dir)
    .filter((f) => ['.puz', '.ipuz'].includes(extname(f).toLowerCase()))
    .sort()

  if (files.length === 0) {
    console.log(`No .puz/.ipuz files in ${dir} — nothing to import (this is fine).`)
    return
  }

  // Convert each file to its storable pieces. A parse failure on one file
  // is reported and skipped, not fatal — one bad puzzle shouldn't block the
  // rest of a library import.
  const rows: Array<{ content_hash: string; source: 'library'; meta: unknown; solution: unknown }> = []
  for (const file of files) {
    try {
      const { template, solution, contentHash } = convertPuzzleFile(
        join(dir, file),
        readFileSync(join(dir, file)),
      )
      rows.push({ content_hash: contentHash, source: 'library', meta: template, solution })
    } catch (err) {
      const why = err instanceof IpuzUnsupportedError ? err.message : String(err)
      console.error(`  ✗ ${file}: ${why}`)
    }
  }

  if (rows.length === 0) {
    console.error('No puzzles converted successfully.')
    process.exit(1)
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    db: { schema: 'crosswords' },
    auth: { persistSession: false },
  })

  // Upsert with ignoreDuplicates so re-runs are no-ops on already-imported
  // puzzles (content_hash dedup — re-importing the same file is free).
  const { data, error } = await supabase
    .from('puzzles')
    .upsert(rows, { onConflict: 'content_hash', ignoreDuplicates: true })
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
