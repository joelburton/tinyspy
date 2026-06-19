#!/usr/bin/env -S npx tsx
/**
 * Seed `common.definitions` from the vendored Scrabble-dictionary
 * definitions at `supabase/data/scrabble-defs.tsv`.
 *
 * The TSV is `word<TAB>def`, one line per word, words already
 * lowercased and ASCII (exported from the freebee-ws SQLite defs
 * table — see docs/common.md). ~192k rows, terse glosses with
 * Scrabble markup (`[n AAS]` inflections, `<aah=v>` / `{word=pos}`
 * cross-refs) preserved verbatim — the FE cleans/links them at
 * render time, and keeping the raw markup keeps the cross-ref data
 * machine-readable for the click-through feature.
 *
 * This is the SEED, not the whole story: `common.definitions` also
 * grows lazily at runtime as the `define` Edge Function caches
 * Wiktionary lookups for words the Scrabble set lacks. Every row
 * here is tagged `source = 'scrabble'`.
 *
 * Idempotency: rows are upserted on `word` with
 * ignoreDuplicates=true, so a re-run is a safe no-op and never
 * clobbers an API-filled (`source='wiktionary'`) def. For a clean
 * reseed: `truncate common.definitions;` then re-run.
 *
 * Usage:    npm run defs:import
 * Auth:     local service_role key by default (bypasses the
 *           SELECT-only grant on common.definitions). Override via
 *           SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY for non-local.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321'
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY
  // Local-dev default — the well-known service_role key emitted by
  // `supabase status`. Non-local targets must set the env var.
  ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DEFS_PATH = resolve(__dirname, '../data/scrabble-defs.tsv')

/** PostgREST handles larger, but 5k keeps payloads + memory bounded.
 *  Matches import-freebee-dictionary.ts. */
const BATCH_SIZE = 5000

type DefinitionRow = {
  word: string
  def: string
  source: 'scrabble'
}

/** Insert in batches; surface PostgREST errors. */
async function batchInsert(
  supabase: SupabaseClient,
  rows: DefinitionRow[],
): Promise<void> {
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE)
    const { error } = await supabase
      .from('definitions')
      .upsert(batch, { onConflict: 'word', ignoreDuplicates: true })
    if (error) {
      console.error(`definitions batch at row ${i} failed:`, error.message)
      process.exit(1)
    }
    process.stdout.write(
      `  upserted rows ${i}..${Math.min(i + batch.length, rows.length)} of ${rows.length}\r`,
    )
  }
  process.stdout.write('\n')
}

async function main() {
  console.log(`Reading ${DEFS_PATH}`)
  const raw = await readFile(DEFS_PATH, 'utf8')

  const rows: DefinitionRow[] = []
  for (const line of raw.split('\n')) {
    if (!line) continue
    const tab = line.indexOf('\t')
    if (tab === -1) continue // malformed; skip defensively
    const word = line.slice(0, tab).trim().toLowerCase()
    const def = line.slice(tab + 1)
    if (!word) continue
    rows.push({ word, def, source: 'scrabble' })
  }
  console.log(`Parsed ${rows.length} definition rows.`)

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    db: { schema: 'common' },
    auth: { persistSession: false },
  })

  console.log(`Upserting ${rows.length} rows into common.definitions...`)
  await batchInsert(supabase, rows)
  console.log('Done.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
