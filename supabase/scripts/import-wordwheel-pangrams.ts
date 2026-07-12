#!/usr/bin/env -S npx tsx
/**
 * Rebuild `wordwheel.pangrams` — the board-seed pool (the word-wheel twin of
 * import-spellingbee-pangrams.ts). See docs/games/wordwheel-plan.md.
 *
 * A word-wheel board is NINE distinct letters containing a pangram — a word
 * using all nine, EACH ONCE. So the seed pool is the set of **9-letter
 * isograms** (all-distinct-letter words), deduped by letter-mask (anagrams
 * share a board). Unlike spellingbee (which forces a band-1 pangram, leaving
 * only ~400 nine-letter isograms), we TAG each seed with its `difficulty` and
 * let the edge builder pick a seed matching the game's required band — so the
 * pool scales with difficulty.
 *
 * Per seed we store:
 *   - `difficulty`   — the min difficulty band of a required-quality 9-letter
 *                      isogram with this mask (how hard the pangram itself is).
 *   - `word_counts`  — [n1..n6]: the number of REQUIRED-quality words (american,
 *                      not slang, slur 0, crude 0) at difficulty EXACTLY band k
 *                      that are ALL-DISTINCT subsets of the nine letters, len>=4,
 *                      CENTRE-AGNOSTIC (a real board fixes one centre, so this
 *                      over-counts — it's a richness proxy; see the plan §8).
 *                      The required set for a game at required band R is
 *                      sum(word_counts[1..R]).
 *   - `has_rare_letters` — the diverse-builder weighting flag.
 *
 * "Used once" ⇒ every word we count is an ISOGRAM (all letters distinct):
 * len === popcount(letter_mask). Word wheel does NOT exclude 's' (each tile is
 * used once, so 's' can't pluralize explosively the way it does in spellingbee).
 *
 * Source: common.words (loaded by `npm run words:import`). Run this AFTER it.
 * Masks are 26-bit letter sets — small enough to use plain JS numbers (bitwise
 * on numbers is far faster than BigInt), so subset is `(w & seed) === w`.
 *
 * Connection: SUPABASE_DB_URL (defaults to the local stack). Needs psql.
 * Usage:  npm run wordwheel:import   (after npm run words:import)
 */

import { execFileSync } from 'node:child_process'
import { copyLoad } from './lib/copyLoad'

const DB_URL =
  process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

/** Each of the nine tiles is used once, so a valid board is nine DISTINCT
 *  letters — the pangram is a 9-letter isogram. */
const WHEEL_SIZE = 9

/** Puzzle-quality floor: a seed is kept only if a board built from it at its
 *  own difficulty band admits at least this many required words. Agrees with
 *  the gate in the edge function and wordwheel.create_game (provisional 15 —
 *  lower than spellingbee's 30 because "used once" yields fewer words; tune
 *  against the printed distribution). */
const MIN_REQUIRED_WORDS_COUNT = 15

/** Letters that earn a sampling boost in the diverse builder (mirrors
 *  spellingbee's tier list — the edge fn does the actual weighting). */
const RARE_LETTERS = new Set(['j', 'q', 'x', 'z', 'k', 'v', 'w', 'y', 'b', 'f', 'h'])

/** Population count of a 26-bit mask (plain-number Kernighan). */
function popcount(mask: number): number {
  let m = mask
  let c = 0
  while (m !== 0) {
    m &= m - 1
    c++
  }
  return c
}

/** Whether any rare letter bit is set. */
function maskHasRareLetters(mask: number): boolean {
  for (const r of RARE_LETTERS) {
    if ((mask & (1 << (r.charCodeAt(0) - 97))) !== 0) return true
  }
  return false
}

type Word = { mask: number; band: number }

/** The REQUIRED-quality, ALL-DISTINCT (isogram) word pool across ALL bands,
 *  len>=4. `word_counts` buckets it by band; the 9-letter subset seeds the
 *  boards. letter_mask is common.words' generated 26-bit set. */
function loadIsogramPool(): Word[] {
  const query = `
    select letter_mask, difficulty, len
      from common.words
     where american and not slang and slur = 0 and crude = 0 and len >= 4
  `
  const out = execFileSync('psql', ['-X', '-At', '-F', '|', DB_URL, '-c', query], {
    encoding: 'utf8',
    maxBuffer: 512 * 1024 * 1024,
  })
  const pool: Word[] = []
  for (const line of out.split('\n')) {
    if (line.length === 0) continue
    const [maskStr, band, lenStr] = line.split('|')
    const mask = Number(maskStr)
    const len = Number(lenStr)
    // "Used once": keep only isograms (every letter distinct).
    if (popcount(mask) === len) pool.push({ mask, band: Number(band) })
  }
  return pool
}

type SeedRow = {
  mask: string
  difficulty: number
  word_counts: string // jsonb text, e.g. "[1,2,3,4,5,6]"
  has_rare_letters: boolean
}

function main() {
  console.log('Loading required-quality isogram pool from common.words...')
  const pool = loadIsogramPool()
  console.log(`  ${pool.length} all-distinct required words (all bands, len>=4).`)
  if (pool.length === 0) {
    console.error('No words found — did you run `npm run words:import` first?')
    process.exit(1)
  }

  // Seed masks: the 9-letter isograms. `difficulty` = the easiest (min band)
  // isogram with that mask.
  const seedDifficulty = new Map<number, number>()
  for (const w of pool) {
    if (popcount(w.mask) !== WHEEL_SIZE) continue
    const prev = seedDifficulty.get(w.mask)
    if (prev === undefined || w.band < prev) seedDifficulty.set(w.mask, w.band)
  }
  console.log(`  ${seedDifficulty.size} distinct 9-letter isogram masks (seed candidates).`)

  // Per seed, bucket the subset words by band → word_counts[0..5] for bands 1..6.
  console.log('Counting findable words per seed (centre-agnostic, per band)...')
  const rows: SeedRow[] = []
  let kept = 0
  const distBuckets = [0, 0, 0, 0, 0, 0] // seed count by required-words tier, for reporting
  for (const [seedMask, difficulty] of seedDifficulty) {
    const counts = [0, 0, 0, 0, 0, 0]
    for (const w of pool) {
      // subset: every bit of the word is in the seed's nine letters.
      if ((w.mask & seedMask) === w.mask) counts[w.band - 1]!++
    }
    // Floor: the required set at THIS seed's difficulty band (the smallest band
    // it can be played at) must clear the gate. A game at a higher required
    // band only adds words, so this guarantees the gate at every valid band.
    const atDifficulty = counts.slice(0, difficulty).reduce((a, b) => a + b, 0)
    const total = counts.reduce((a, b) => a + b, 0)
    distBuckets[Math.min(5, Math.floor(total / 25))]!++
    if (atDifficulty < MIN_REQUIRED_WORDS_COUNT) continue
    kept++
    rows.push({
      mask: String(seedMask),
      difficulty,
      word_counts: `[${counts.join(',')}]`,
      has_rare_letters: maskHasRareLetters(seedMask),
    })
  }
  console.log(
    `Kept ${kept} / ${seedDifficulty.size} seeds` +
      ` (>= ${MIN_REQUIRED_WORDS_COUNT} required words at their own difficulty band).`,
  )
  console.log(`  seed word-count distribution (centre-agnostic total, buckets of 25): ${distBuckets.join(' / ')}`)
  const byBand = [0, 0, 0, 0, 0, 0]
  for (const r of rows) byBand[r.difficulty - 1]!++
  console.log(`  kept seeds by pangram difficulty band 1..6: ${byBand.join(' / ')}`)

  console.log(`Loading ${rows.length} seed rows via COPY...`)
  copyLoad(
    DB_URL,
    'wordwheel.pangrams',
    ['mask', 'difficulty', 'word_counts', 'has_rare_letters'],
    rows.map((r) => [r.mask, r.difficulty, r.word_counts, r.has_rare_letters]),
  )
  console.log('Done.')
}

main()
