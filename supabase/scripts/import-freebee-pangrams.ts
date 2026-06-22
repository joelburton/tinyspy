#!/usr/bin/env -S npx tsx
/**
 * Rebuild `freebee.pangrams` — the board-seed pool — from the
 * **floor slice** of `common.words` (difficulty <= FLOOR_DIFFICULTY).
 *
 * A freebee board must contain a pangram (a word using all 7 of its
 * distinct letters). Rather than pick 7 random letters and hope, we
 * start from known pangrams: every word at the floor difficulty with
 * exactly 7 distinct letters is a board seed. This script finds them,
 * dedupes by letter-mask, and for each seed precomputes the count of
 * floor-difficulty words that fit (the ≥30-words gate) plus the
 * has_rare_letters weighting flag the edge function's diverse builder
 * uses.
 *
 * ## Why qualify at the floor (Option B)
 *
 * freebee's difficulty thresholds (required <= 50 / legal <= 70) are
 * slated to become a per-game player choice — a basic player might
 * pick 35/50, an advanced player 70/85. The seed pool copes by
 * qualifying every seed at the LOWEST difficulty we offer
 * (FLOOR_DIFFICULTY), so a single row per seed is valid for everyone:
 *
 *   1. The seed has a pangram at <= floor → every board carries a
 *      *common*, findable pangram (no obscure-only pangrams like
 *      CALDRON), at any chosen difficulty.
 *   2. The seed has >= 30 words at <= floor → no thin boards, even at
 *      the easiest level.
 *
 * Because the difficulty lists are nested (a higher threshold only
 * ever ADDS words), a seed that clears both gates at the floor clears
 * them at every higher level automatically. The stored
 * `required_words_count` is therefore the floor count — a deliberately
 * pessimistic lower bound; the real board (recounted at build time
 * against the player's chosen levels) will have at least that many.
 * See docs/games/freebee.md → "Planned: per-player difficulty".
 *
 * Source: `common.words`, the shared master list (loaded by
 * `npm run words:import`). The floor slice is: difficulty <=
 * FLOOR_DIFFICULTY, not a slur, valid in american OR british, len >=
 * 4, and (defensively) no 's' (a board never contains 's', so an
 * s-word can't seed or fit one). This MUST be run AFTER words:import;
 * it reads what's already in the table.
 *
 * (Before the common.words merge this script also built
 * freebee.dictionary from vendored SCOWL files; that table is gone —
 * candidate_words now filters common.words directly.)
 *
 * Loading: freebee.pangrams is bulk-reloaded via psql COPY
 * (TRUNCATE + insert) over a direct Postgres connection — see
 * lib/copyLoad. Connects as the superuser, so no RLS / grant
 * gymnastics.
 *
 * Connection: SUPABASE_DB_URL (a Postgres connection string).
 * Defaults to the local stack. Requires psql on PATH.
 *
 * Usage:  npm run freebee:import   (after npm run words:import)
 */

import { execFileSync } from 'node:child_process'
import { copyLoad } from './lib/copyLoad'

const DB_URL =
  process.env.SUPABASE_DB_URL ??
  'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

/** The lowest difficulty freebee offers. Seeds qualify here (Option B):
 *  a seed needs a pangram AND >= 30 words at <= this difficulty, which
 *  by list-nesting makes it valid at every higher difficulty too. The
 *  in-play thresholds (required <= 50 / legal <= 70, in
 *  freebee.candidate_words) are SEPARATE and higher; this floor only
 *  governs seed selection. */
const FLOOR_DIFFICULTY = 35

/** Puzzle-quality gate: a seed must admit at least this many words at
 *  the floor difficulty. Agrees with the same gate in the edge
 *  function (MIN_REQUIRED_WORDS_COUNT) and freebee.create_game. */
const MIN_REQUIRED_WORDS_COUNT = 30

/** Vowels for the ≥2-vowels puzzle rule. 'y' is NOT counted as a
 *  vowel here — matches ~/freebee-ws/server/game.js. */
const VOWELS = new Set(['a', 'e', 'i', 'o', 'u'])

/** Letters considered "rare enough to deserve a weighting boost" in
 *  the diverse builder. Mirrors the tier list in
 *  ~/freebee-ws/server/builders.js — we only need the boolean here
 *  because the edge function does the actual weighting. */
const RARE_LETTERS = new Set([
  'j', 'q', 'x', 'z',          // very rare
  'k', 'v', 'w', 'y',          // somewhat rare
  'b', 'f', 'h',               // mildly under-represented
])

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

/** Decides whether a 7-letter mask could be a valid freebee puzzle
 *  seed. Mirrors `isValidPuzzleMask` in ~/freebee-ws/server/game.js.
 *  The floor slice is already 's'-free, but the CHECK stays here for
 *  documentation + defense in depth. */
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

type PangramRow = {
  mask: string
  required_words_count: number
  has_rare_letters: boolean
}

/** Pull the floor slice out of common.words as `letter_mask`s.
 *  letter_mask is the generated column — already the 26-bit set we
 *  need, no recomputation. psql -At gives tab-separated rows;
 *  letter_mask arrives as a decimal string we parse to BigInt. */
function loadFloorMasks(): bigint[] {
  const query = `
    select letter_mask
      from common.words
     where difficulty <= ${FLOOR_DIFFICULTY}
       and not slur
       and (american or british)
       and len >= 4
       and (letter_mask & (1::bigint << 18)) = 0   -- no 's'
  `
  // -X skips ~/.psqlrc (a user's \pset lines would otherwise echo
  // confirmation noise into stdout and corrupt the parse); -At gives
  // unaligned, tuples-only output — one bare letter_mask per line.
  const out = execFileSync(
    'psql',
    ['-X', '-At', DB_URL, '-c', query],
    { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 },
  )
  const masks: bigint[] = []
  for (const line of out.split('\n')) {
    if (line.length === 0) continue
    masks.push(BigInt(line))
  }
  return masks
}

function main() {
  console.log(`Loading floor slice (difficulty <= ${FLOOR_DIFFICULTY}) from common.words...`)
  const floorMasks = loadFloorMasks()
  console.log(`  ${floorMasks.length} floor-difficulty words.`)
  if (floorMasks.length === 0) {
    console.error(
      'No floor words found — did you run `npm run words:import` first?',
    )
    process.exit(1)
  }

  // Candidate seeds: distinct masks of FLOOR words with exactly 7
  // distinct letters AND a valid puzzle shape. Sourcing seeds from the
  // floor slice is what guarantees every board has a common pangram
  // (Option B, rule 1).
  console.log('Finding pangram seed masks...')
  const pangramCandidates = new Set<bigint>()
  for (const mask of floorMasks) {
    if (popcount26(mask) === 7 && isValidPuzzleMask(mask)) {
      pangramCandidates.add(mask)
    }
  }
  console.log(`  ${pangramCandidates.size} candidate pangram masks.`)

  // For each seed, count FLOOR words whose mask is a subset of it
  // (`wordMask & ~seedMask = 0`). Keep seeds with >= the gate — a seed
  // too thin even at the floor is dead weight (Option B, rule 2).
  console.log('Counting floor words per seed...')
  const pangramRows: PangramRow[] = []
  for (const seedMask of pangramCandidates) {
    let count = 0
    for (const wordMask of floorMasks) {
      if ((wordMask & ~seedMask) === 0n) count++
    }
    if (count >= MIN_REQUIRED_WORDS_COUNT) {
      pangramRows.push({
        mask: seedMask.toString(),
        required_words_count: count,
        has_rare_letters: maskHasRareLetters(seedMask),
      })
    }
  }
  console.log(
    `Prepared ${pangramRows.length} pangram seed rows`
    + ` (>= ${MIN_REQUIRED_WORDS_COUNT} words each at the floor).`,
  )

  console.log(`Loading ${pangramRows.length} pangram rows via COPY...`)
  copyLoad(
    DB_URL,
    'freebee.pangrams',
    ['mask', 'required_words_count', 'has_rare_letters'],
    pangramRows.map((r) => [r.mask, r.required_words_count, r.has_rare_letters]),
  )

  console.log('Done.')
}

main()
