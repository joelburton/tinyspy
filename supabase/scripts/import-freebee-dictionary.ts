#!/usr/bin/env -S npx tsx
/**
 * Import the SCOWL word lists into `freebee.dictionary` and
 * derive `freebee.pangrams` from them.
 *
 * Source: vendored copies of SCOWL (Spell Checker Oriented
 * Word Lists) at `supabase/data/scowl-50.txt` (the smaller,
 * higher-quality SCORING list) and `supabase/data/scowl-80.txt`
 * (the larger LEGAL list, a superset of scoring). Both files
 * are committed to the repo so the script needs no network.
 *
 * Two tables get populated:
 *
 *   1. freebee.dictionary — one row per accepted word, with
 *      precomputed letter_mask + flags (in_scoring, in_legal).
 *
 *   2. freebee.pangrams — one row per unique 7-distinct-letter
 *      mask drawn from the scoring set, that ALSO satisfies
 *      `isValidPuzzleMask` (no 's', q→u, ≥2 vowels). Each row
 *      carries the count of scoring words that fit that mask
 *      (drives the ≥30-words gate at board-build time) and a
 *      `has_rare_letters` flag (drives the diverse-builder's
 *      weighted sampling).
 *
 * Normalization rules (applied to BOTH files at import time):
 *   - lowercase
 *   - ASCII-only (no accented characters, no punctuation)
 *   - length ≥ 4
 *   - no 's' (freebee never uses 's' in a board, so an
 *     s-containing word can never be a legal submission —
 *     filtering at import saves storage + speeds lookup)
 *
 * Idempotency: every row is upserted on `word` with
 * ignoreDuplicates=true. Re-runs are safe no-ops. For a SCOWL
 * version bump (unlikely; Joel doesn't plan to chase versions),
 * truncate both tables before re-running:
 *
 *   truncate freebee.dictionary, freebee.pangrams cascade;
 *
 * Usage:
 *   npm run freebee:import
 *
 * Auth: uses the local Supabase service_role key by default
 * (matches `supabase status -o env`'s SERVICE_ROLE_KEY).
 * Override via SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY env
 * vars for a non-local target. Service-role bypasses RLS and
 * column-grants — required to INSERT into both tables (no
 * authenticated grant for INSERT).
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321'
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY
  // Local-dev default — the well-known service_role key emitted
  // by `supabase status`. Anything other than localhost should
  // set the env var explicitly.
  ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

// Vendored SCOWL files. Resolved relative to THIS script's
// directory so the working directory doesn't matter.
const __dirname = dirname(fileURLToPath(import.meta.url))
const SCOWL_50_PATH = resolve(__dirname, '../data/scowl-50.txt')
const SCOWL_80_PATH = resolve(__dirname, '../data/scowl-80.txt')

/** Bulk-insert batch size. PostgREST can handle larger but
 *  5k keeps memory bounded and request payloads reasonable. */
const BATCH_SIZE = 5000

/** ASCII letter test: lowercase a..z only, no other chars. */
const ASCII_LOWER_RE = /^[a-z]+$/

/** Vowels for the ≥2-vowels puzzle rule. 'y' is NOT counted
 *  as a vowel here — matches ~/freebee-ws/server/game.js. */
const VOWELS = new Set(['a', 'e', 'i', 'o', 'u'])

/** Letters considered "rare enough to deserve a weighting boost"
 *  in the diverse builder. Anything in this set tilts a mask's
 *  has_rare_letters flag to true. Mirrors the tier list in
 *  ~/freebee-ws/server/builders.js — we only need the boolean
 *  here because the edge function does the actual weighting. */
const RARE_LETTERS = new Set([
  // very rare (×8 in upstream sampler)
  'j', 'q', 'x', 'z',
  // somewhat rare (×3)
  'k', 'v', 'w', 'y',
  // mildly under-represented (×1.5)
  'b', 'f', 'h',
])

/** Convert 'a'..'z' to a 26-bit mask. 'a' → bit 0; 'z' → bit 25. */
function letterMask(word: string): bigint {
  let mask = 0n
  for (const ch of word) {
    mask |= 1n << BigInt(ch.charCodeAt(0) - 97)
  }
  return mask
}

/** Population count for a 26-bit mask. */
function popcount26(mask: bigint): number {
  let m = mask
  let count = 0
  while (m !== 0n) {
    count += Number(m & 1n)
    m >>= 1n
  }
  return count
}

/** A normalized SCOWL word, ready for insertion. Returns null
 *  if the word is rejected by the rules above. */
function normalize(raw: string): string | null {
  const word = raw.trim().toLowerCase()
  if (word.length < 4) return null
  if (!ASCII_LOWER_RE.test(word)) return null
  if (word.includes('s')) return null
  return word
}

/** Read a SCOWL file and return its accepted words as a Set
 *  (dedup is free this way). */
async function loadScowl(path: string, label: string): Promise<Set<string>> {
  console.log(`Reading ${label}: ${path}`)
  const raw = await readFile(path, 'utf8')
  const accepted = new Set<string>()
  for (const line of raw.split('\n')) {
    const w = normalize(line)
    if (w !== null) accepted.add(w)
  }
  console.log(`  ${accepted.size} words accepted from ${label}`)
  return accepted
}

/** Decides whether a 7-letter mask could be a valid freebee
 *  puzzle seed. Mirrors `isValidPuzzleMask` in
 *  ~/freebee-ws/server/game.js. We've already filtered 's'
 *  out of the dictionary at normalize() time, so any mask
 *  derived from those words can't contain 's' — but the
 *  CHECK still belongs here for documentation + defense in
 *  depth (a future SCOWL bump that accidentally includes 's'
 *  would skip the pangrams import without contaminating the
 *  table). */
function isValidPuzzleMask(mask: bigint): boolean {
  // No 's'. 's' is bit 18 ('s'.charCodeAt(0) - 97 = 18).
  if ((mask & (1n << 18n)) !== 0n) return false
  // q → u: if 'q' (bit 16) is in, 'u' (bit 20) must also be.
  const hasQ = (mask & (1n << 16n)) !== 0n
  const hasU = (mask & (1n << 20n)) !== 0n
  if (hasQ && !hasU) return false
  // ≥2 vowels.
  let vowelCount = 0
  for (const v of VOWELS) {
    const bit = 1n << BigInt(v.charCodeAt(0) - 97)
    if ((mask & bit) !== 0n) vowelCount++
  }
  return vowelCount >= 2
}

/** Whether any rare letter is set in the mask. */
function maskHasRareLetters(mask: bigint): boolean {
  for (const r of RARE_LETTERS) {
    const bit = 1n << BigInt(r.charCodeAt(0) - 97)
    if ((mask & bit) !== 0n) return true
  }
  return false
}

/** One row to upsert into `freebee.dictionary`. Note bigint
 *  comes out as a string for the JSON serializer; Postgres
 *  parses it back into bigint on insert because the column
 *  type is `bigint`. */
type DictionaryRow = {
  word: string
  letter_mask: string
  in_scoring: boolean
  in_legal: boolean
}

type PangramRow = {
  mask: string
  scoring_words: number
  has_rare_letters: boolean
}

/** Insert in batches; surface PostgREST errors. */
async function batchInsert<T>(
  supabase: SupabaseClient,
  table: string,
  rows: T[],
  conflictKey: string,
): Promise<void> {
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE)
    const { error } = await supabase
      .from(table)
      .upsert(batch, { onConflict: conflictKey, ignoreDuplicates: true })
    if (error) {
      console.error(
        `${table} batch starting at row ${i} failed:`,
        error.message,
      )
      process.exit(1)
    }
    process.stdout.write(
      `  upserted rows ${i}..${Math.min(i + batch.length, rows.length)} of ${rows.length}\r`,
    )
  }
  process.stdout.write('\n')
}

async function main() {
  // ─── Load + normalize ────────────────────────────────────
  const scoring = await loadScowl(SCOWL_50_PATH, 'scowl-50 (scoring)')
  const legal   = await loadScowl(SCOWL_80_PATH, 'scowl-80 (legal)')

  // Union: every word in either set. in_legal includes scoring
  // (scoring is a subset of legal); we assert this is true even
  // if the SCOWL bundles ever divulged, because being in
  // scoring but not legal would be nonsense (we'd accept a word
  // for points but reject it as not-a-word).
  const allWords = new Set<string>([...scoring, ...legal])
  console.log(`Union: ${allWords.size} unique words.`)

  // ─── Build dictionary rows ───────────────────────────────
  console.log('Computing letter masks...')
  const dictRows: DictionaryRow[] = []
  for (const word of allWords) {
    const inScoring = scoring.has(word)
    const inLegal   = legal.has(word) || inScoring
    if (inScoring && !inLegal) {
      // Defensive: would indicate a SCOWL bundle that has
      // scoring \ legal nonempty. Flag and skip rather than
      // import inconsistent data.
      console.warn(`  "${word}" in scoring but not legal — skipping`)
      continue
    }
    dictRows.push({
      word,
      letter_mask: letterMask(word).toString(),
      in_scoring: inScoring,
      in_legal: inLegal,
    })
  }
  console.log(`Prepared ${dictRows.length} dictionary rows.`)

  // ─── Build pangram rows ──────────────────────────────────
  // For each SCORING word that has exactly 7 distinct letters,
  // its letter_mask is a candidate pangram seed. Aggregate by
  // mask, count scoring words that fit (mask superset test),
  // filter to valid puzzle masks.
  console.log('Building pangram seed pool from scoring set...')
  const pangramCandidates = new Set<bigint>()
  for (const word of scoring) {
    const mask = letterMask(word)
    if (popcount26(mask) === 7 && isValidPuzzleMask(mask)) {
      pangramCandidates.add(mask)
    }
  }
  console.log(`  ${pangramCandidates.size} candidate pangram masks.`)

  // Precompute every scoring word's mask once for the
  // count-words-fitting-this-puzzle inner loop. Without this,
  // the inner loop is O(scoringWords) text scans per mask.
  const scoringMasks: bigint[] = []
  for (const word of scoring) {
    scoringMasks.push(letterMask(word))
  }

  const pangramRows: PangramRow[] = []
  for (const seedMask of pangramCandidates) {
    // Count scoring words whose mask is a subset of seedMask.
    // `wordMask & ~seedMask = 0` is the subset test.
    let count = 0
    for (const wordMask of scoringMasks) {
      if ((wordMask & ~seedMask) === 0n) count++
    }
    // The runtime ≥30-words gate applies at board-build time
    // too; we store the count so the edge function can read it
    // without recomputing. Filtering here at <30 keeps the
    // table small without losing information (a seed that can
    // never satisfy the gate is dead weight).
    if (count >= 30) {
      pangramRows.push({
        mask: seedMask.toString(),
        scoring_words: count,
        has_rare_letters: maskHasRareLetters(seedMask),
      })
    }
  }
  console.log(`Prepared ${pangramRows.length} pangram seed rows (≥30 words each).`)

  // ─── Insert ──────────────────────────────────────────────
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    db: { schema: 'freebee' },
    auth: { persistSession: false },
  })

  console.log(`Upserting ${dictRows.length} dictionary rows...`)
  await batchInsert(supabase, 'dictionary', dictRows, 'word')

  console.log(`Upserting ${pangramRows.length} pangram rows...`)
  await batchInsert(supabase, 'pangrams', pangramRows, 'mask')

  console.log('Done.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
