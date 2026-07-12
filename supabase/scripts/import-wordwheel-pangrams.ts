#!/usr/bin/env -S npx tsx
/**
 * Rebuild `wordwheel.pangrams` — the board-seed pool (the word-wheel twin of
 * import-spellingbee-pangrams.ts). See docs/games/wordwheel.md.
 *
 * A word-wheel board is a MULTISET of nine letters (duplicates allowed — two
 * `b` tiles is a legal wheel) containing a pangram — a word using all nine
 * tiles. So the seed pool is the set of **9-letter words**, deduped by their
 * sorted-letter string (anagrams share a board). The multiset is the board's
 * identity, so the sorted string is the key — a bitmask can't be, because
 * masks collapse multiplicity. Unlike spellingbee (which forces a band-1
 * pangram), we TAG each seed with its `difficulty` and let the edge builder
 * pick a seed matching the game's required band — so the pool scales with
 * difficulty.
 *
 * Per seed we store:
 *   - `letters`      — the nine letters sorted, e.g. 'aabcdeghi' (the PK; the
 *                      table's `mask` column is generated from it).
 *   - `difficulty`   — the min difficulty band of a required-quality 9-letter
 *                      word with this multiset (how hard the pangram itself is).
 *   - `word_counts`  — [n1..n6]: the number of REQUIRED-quality words (american,
 *                      not slang, slur 0, crude 0) at difficulty EXACTLY band k
 *                      whose per-letter counts FIT the multiset (each letter used
 *                      no more times than it has tiles), len>=4, CENTRE-AGNOSTIC
 *                      (a real board fixes one centre, so this over-counts — it's
 *                      a richness proxy). The required set for a game at required
 *                      band R is sum(word_counts[1..R]).
 *   - `has_rare_letters` — the diverse-builder weighting flag.
 *
 * ── The counting algorithm: submask enumeration ─────────────────────────────
 * The naive shape (for each seed, scan the whole ~272k-word pool) is ~38k
 * seeds x 272k words ≈ 10 billion subset tests — minutes of work. Instead we
 * group the pool by exact letter-mask once, and per seed enumerate only the
 * SUBMASKS of the seed's 9-bit (or fewer) mask — at most 2^9 = 512 per seed,
 * ~20M map lookups total, seconds. Within a mask group:
 *   - isograms (no repeated letters) fit any seed whose mask contains theirs,
 *     so their per-band counts are added wholesale;
 *   - repeat-letter words carry their repeated letters' counts and are
 *     checked against the seed's tile counts individually.
 *
 * Word wheel does NOT exclude 's' (a tile is spent per use, so 's' pluralizes
 * at most once per 's' tile — not explosively the way it does in spellingbee).
 *
 * Source: common.words (loaded by `npm run words:import`). Run this AFTER it.
 * Masks are 26-bit letter sets — small enough to use plain JS numbers (bitwise
 * on numbers is far faster than BigInt).
 *
 * Connection: SUPABASE_DB_URL (defaults to the local stack). Needs psql.
 * Usage:  npm run wordwheel:import   (after npm run words:import)
 */

import { execFileSync } from 'node:child_process'
import { copyLoad } from './lib/copyLoad'

const DB_URL =
  process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

/** Nine tiles on the wheel; the pangram is any 9-letter word fitting them. */
const WHEEL_SIZE = 9

/** Puzzle-quality floor: a seed is kept only if a board built from it at its
 *  own difficulty band admits at least this many required words. Agrees with
 *  the gate in the edge function and wordwheel.create_game (provisional 15 —
 *  lower than spellingbee's 30 because spending a tile per use yields fewer
 *  words than unbounded reuse; tune against the printed distribution). */
const MIN_REQUIRED_WORDS_COUNT = 15

/** Letters that earn a sampling boost in the diverse builder (mirrors
 *  spellingbee's tier list — the edge fn does the actual weighting). */
const RARE_LETTERS = new Set(['j', 'q', 'x', 'z', 'k', 'v', 'w', 'y', 'b', 'f', 'h'])

/** Whether any rare letter bit is set. */
function maskHasRareLetters(mask: number): boolean {
  for (const r of RARE_LETTERS) {
    if ((mask & (1 << (r.charCodeAt(0) - 97))) !== 0) return true
  }
  return false
}

/** Per-letter occurrence counts, indexed 0..25. */
function letterCounts(word: string): Uint8Array {
  const counts = new Uint8Array(26)
  for (let i = 0; i < word.length; i++) counts[word.charCodeAt(i) - 97]!++
  return counts
}

/** A word's repeated letters only: [letterIdx, occurrences] with occurrences
 *  >= 2. Empty for isograms — the common case, which lets the seed loop skip
 *  per-word checks entirely for them. */
function repeatedLetters(word: string): Array<[number, number]> {
  const counts = letterCounts(word)
  const repeats: Array<[number, number]> = []
  for (let i = 0; i < 26; i++) {
    if (counts[i]! >= 2) repeats.push([i, counts[i]!])
  }
  return repeats
}

type PoolWord = { word: string; mask: number; band: number }

/** The REQUIRED-quality word pool across ALL bands, len>=4 — no isogram
 *  filter: repeat-letter words are first-class fits now (bounded by the
 *  seed's tile counts). letter_mask is common.words' generated 26-bit set. */
function loadPool(): PoolWord[] {
  const query = `
    select word, letter_mask, difficulty
      from common.words
     where american and not slang and slur = 0 and crude = 0 and len >= 4
  `
  const out = execFileSync('psql', ['-X', '-At', '-F', '|', DB_URL, '-c', query], {
    encoding: 'utf8',
    maxBuffer: 512 * 1024 * 1024,
  })
  const pool: PoolWord[] = []
  for (const line of out.split('\n')) {
    if (line.length === 0) continue
    const [word, maskStr, band] = line.split('|')
    pool.push({ word: word!, mask: Number(maskStr), band: Number(band) })
  }
  return pool
}

/** One exact-mask group of the pool: isograms are pre-bucketed by band
 *  (they fit any containing seed unconditionally); repeat-letter words are
 *  kept individually for the per-seed tile-count check. */
type MaskGroup = {
  isoCounts: number[] // [n1..n6] isograms with exactly this mask
  repeatWords: Array<{ repeats: Array<[number, number]>; band: number }>
}

type SeedRow = {
  letters: string
  difficulty: number
  word_counts: string // jsonb text, e.g. "[1,2,3,4,5,6]"
  has_rare_letters: boolean
}

/** p10/p25/p50/p75/p90 of a numeric sample (nearest-rank), for the gate
 *  report. */
function percentiles(values: number[]): string {
  if (values.length === 0) return '(none)'
  const sorted = [...values].sort((a, b) => a - b)
  const at = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]
  return `p10=${at(10)} p25=${at(25)} p50=${at(50)} p75=${at(75)} p90=${at(90)}`
}

function main() {
  console.log('Loading required-quality word pool from common.words...')
  const pool = loadPool()
  console.log(`  ${pool.length} required-quality words (all bands, len>=4).`)
  if (pool.length === 0) {
    console.error('No words found — did you run `npm run words:import` first?')
    process.exit(1)
  }

  // Group the pool by exact mask (see the header: submask enumeration).
  const byMask = new Map<number, MaskGroup>()
  for (const w of pool) {
    let group = byMask.get(w.mask)
    if (group === undefined) {
      group = { isoCounts: [0, 0, 0, 0, 0, 0], repeatWords: [] }
      byMask.set(w.mask, group)
    }
    const repeats = repeatedLetters(w.word)
    if (repeats.length === 0) group.isoCounts[w.band - 1]!++
    else group.repeatWords.push({ repeats, band: w.band })
  }
  console.log(`  ${byMask.size} distinct letter-masks in the pool.`)

  // Seed multisets: the 9-letter words, deduped by sorted letters.
  // `difficulty` = the easiest (min band) 9-letter word with that multiset.
  const seedDifficulty = new Map<string, number>()
  for (const w of pool) {
    if (w.word.length !== WHEEL_SIZE) continue
    const letters = [...w.word].sort().join('')
    const prev = seedDifficulty.get(letters)
    if (prev === undefined || w.band < prev) seedDifficulty.set(letters, w.band)
  }
  console.log(`  ${seedDifficulty.size} distinct 9-letter multisets (seed candidates).`)

  // Per seed, count the fitting words by band → word_counts[0..5] for bands
  // 1..6, via submask enumeration over the mask groups.
  console.log('Counting fitting words per seed (centre-agnostic, per band)...')
  const rows: SeedRow[] = []
  const distBuckets = [0, 0, 0, 0, 0, 0] // seed count by required-words tier, for reporting
  const keptAtDifficulty: number[] = []
  const droppedAtDifficulty: number[] = []
  for (const [letters, difficulty] of seedDifficulty) {
    const seedMask = letterCounts(letters).reduce((m, c, i) => (c > 0 ? m | (1 << i) : m), 0)
    const seedCounts = letterCounts(letters)
    const counts = [0, 0, 0, 0, 0, 0]
    // Enumerate every submask of seedMask (standard (sub-1)&mask walk, which
    // visits seedMask itself down to 0) — only masks the wheel can contain.
    let sub = seedMask
    for (;;) {
      const group = byMask.get(sub)
      if (group !== undefined) {
        for (let b = 0; b < 6; b++) counts[b]! += group.isoCounts[b]!
        for (const rw of group.repeatWords) {
          // A repeat word fits iff each repeated letter has enough tiles.
          // (Its single-occurrence letters are covered by mask containment.)
          let fits = true
          for (const [idx, occ] of rw.repeats) {
            if (seedCounts[idx]! < occ) {
              fits = false
              break
            }
          }
          if (fits) counts[rw.band - 1]!++
        }
      }
      if (sub === 0) break
      sub = (sub - 1) & seedMask
    }
    // Floor: the required set at THIS seed's difficulty band (the smallest band
    // it can be played at) must clear the gate. A game at a higher required
    // band only adds words, so this guarantees the gate at every valid band.
    const atDifficulty = counts.slice(0, difficulty).reduce((a, b) => a + b, 0)
    const total = counts.reduce((a, b) => a + b, 0)
    distBuckets[Math.min(5, Math.floor(total / 25))]!++
    if (atDifficulty < MIN_REQUIRED_WORDS_COUNT) {
      droppedAtDifficulty.push(atDifficulty)
      continue
    }
    keptAtDifficulty.push(atDifficulty)
    rows.push({
      letters,
      difficulty,
      word_counts: `[${counts.join(',')}]`,
      has_rare_letters: maskHasRareLetters(seedMask),
    })
  }
  console.log(
    `Kept ${rows.length} / ${seedDifficulty.size} seeds` +
      ` (>= ${MIN_REQUIRED_WORDS_COUNT} required words at their own difficulty band).`,
  )
  console.log(`  seed word-count distribution (centre-agnostic total, buckets of 25): ${distBuckets.join(' / ')}`)
  // The gate report: how comfortably do seeds clear (or miss) the ≥15 floor
  // at their own band? Read this to decide whether 15 is still the right gate.
  console.log(`  required-at-own-band percentiles — kept:    ${percentiles(keptAtDifficulty)}`)
  console.log(`  required-at-own-band percentiles — dropped: ${percentiles(droppedAtDifficulty)}`)
  const byBand = [0, 0, 0, 0, 0, 0]
  for (const r of rows) byBand[r.difficulty - 1]!++
  console.log(`  kept seeds by pangram difficulty band 1..6: ${byBand.join(' / ')}`)

  console.log(`Loading ${rows.length} seed rows via COPY...`)
  // `mask` is a generated column — omitted from the COPY column list, it
  // self-fills from `letters`.
  copyLoad(
    DB_URL,
    'wordwheel.pangrams',
    ['letters', 'difficulty', 'word_counts', 'has_rare_letters'],
    rows.map((r) => [r.letters, r.difficulty, r.word_counts, r.has_rare_letters]),
  )
  console.log('Done.')
}

main()
