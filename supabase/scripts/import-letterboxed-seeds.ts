#!/usr/bin/env -S npx tsx
/**
 * Rebuild `letterboxed.seeds` — the board-seed pool. See
 * docs/letterboxed-plan.md §4 + §9.
 *
 * A letterboxed board is TWELVE DISTINCT LETTERS, three to a side, and it must
 * be KNOWN SOLVABLE. The only affordable way to know that is to build backwards
 * from a solution: find a chained word PAIR — `last(word_a) = first(word_b)` —
 * whose letters union to exactly twelve distinct letters. Any such pair IS a
 * solvable board, because the board builder then partitions those twelve into
 * four sides in a way that keeps both words playable.
 *
 * We store the pair, not the finished puzzle, because the two halves have very
 * different costs. Finding pairs is a ~10^8-comparison scan (offline, once);
 * choosing the PARTITION is microseconds (per game) and is what makes two games
 * on the same twelve letters feel different. Same split wordwheel.pangrams
 * makes — seed the expensive half, re-roll the cheap half per game.
 *
 * ── Two pool filters, both load-bearing ────────────────────────────────────
 *   1. DOUBLED LETTERS ARE UNPLAYABLE. 'bell' puts two consecutive letters on
 *      the same side by definition, on every possible board. That is 24% of the
 *      dictionary (65,239 of 270,014), and dropping them at load rather than at
 *      seed-selection is what keeps the search honest — an early version of this
 *      scan wasted a third of its candidate seeds on pairs that could never be
 *      realized as boards.
 *   2. >12 DISTINCT LETTERS can't fit a board at all.
 *
 * ── Why only band <= 2 ─────────────────────────────────────────────────────
 * The seeded pair is the board's guaranteed solution, so it should be two words
 * a person might actually think of. Pinning it low is spellingbee's rule (it
 * forces a band-1 pangram so the target is gettable) and it leaves `legal_band`
 * on the game as the only band players choose — a band-5 game accepts fancy
 * words without its guaranteed solution becoming two obscurities. Restricting
 * the pool up front also shrinks the pair scan by ~20x, since a seed can only
 * be band <= 2 if some pair of band <= 2 words produces it.
 *
 * Seeds are drawn from `american AND british` words so the guarantee survives
 * whatever dialect a game picks.
 *
 * Source: common.words (loaded by `gmake all-words`). Run this AFTER it.
 * Masks are 26-bit letter sets — plain JS numbers, far faster than BigInt.
 *
 * Connection: SUPABASE_DB_URL (defaults to the local stack). Needs psql.
 * Usage:  npm run _letterboxed:import   (public entry: `gmake g-letterboxed-seeds ENV=…`)
 */

import { execFileSync } from 'node:child_process'
import { copyLoad } from './lib/copyLoad'

const DB_URL =
  process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

const A = 'a'.charCodeAt(0)
/** Letters on a board — four sides of three. */
const BOARD_SIZE = 12
/** Letter Boxed's own floor; shorter words aren't accepted anywhere. */
const MIN_LEN = 3
/** Ceiling for a SEED word's difficulty band — see the docstring. */
const MAX_SEED_BAND = 2

const popcount = (n: number): number => {
  n = n - ((n >> 1) & 0x55555555)
  n = (n & 0x33333333) + ((n >> 2) & 0x33333333)
  return (((n + (n >> 4)) & 0x0f0f0f0f) * 0x01010101) >> 24
}

const maskOf = (w: string): number => {
  let m = 0
  for (let i = 0; i < w.length; i++) m |= 1 << (w.charCodeAt(i) - A)
  return m
}

/** The sorted-letter string for a mask — the seed table's primary key. */
const lettersOf = (mask: number): string => {
  let s = ''
  for (let b = 0; b < 26; b++) if (mask & (1 << b)) s += String.fromCharCode(A + b)
  return s
}

const hasDoubledLetter = (w: string): boolean => {
  for (let i = 1; i < w.length; i++) if (w[i] === w[i - 1]) return true
  return false
}

/**
 * Can these twelve letters be split into four sides of three so that BOTH
 * solution words stay playable? Adjacent letters in a word must land on
 * different sides, which is a graph-colouring question: nodes are the twelve
 * letters, an edge joins any two that are consecutive somewhere in either word,
 * and we need four independent sets of exactly three.
 *
 * A pair CAN fail this — a long word like 'paradigmatic' gives its repeated 'a'
 * six distinct neighbours, and a node that busy may have no side left to sit on.
 * It's rare (~0.2% of pairs) but real, and it's checked HERE rather than in the
 * board builder so the builder never needs a fallback path: every seed row is
 * partitionable by construction. Exhaustive backtracking, so a `false` means no
 * partition exists rather than that this ordering didn't find one — which is
 * also why the builder is free to re-roll a DIFFERENT random partition per game
 * and still be sure of finding one. Bounded and cheap: 12 nodes, and the worst
 * case measured over the real pool visits ~2.6k states.
 */
const partitionable = (letters: string, words: string[]): boolean => {
  const idx = new Map([...letters].map((c, i) => [c, i]))
  const conflict = new Array(BOARD_SIZE).fill(0)
  for (const w of words) {
    for (let i = 1; i < w.length; i++) {
      const u = idx.get(w[i - 1]!)!
      const v = idx.get(w[i]!)!
      if (u !== v) {
        conflict[u]! |= 1 << v
        conflict[v]! |= 1 << u
      }
    }
  }
  const sides: number[][] = [[], [], [], []]
  const place = (k: number): boolean => {
    if (k === BOARD_SIZE) return true
    for (let s = 0; s < 4; s++) {
      if (sides[s]!.length >= 3) continue
      if (sides[s]!.some((m) => conflict[k]! & (1 << m))) continue
      sides[s]!.push(k)
      if (place(k + 1)) return true
      sides[s]!.pop()
    }
    return false
  }
  return place(0)
}

function main() {
  // ── load ────────────────────────────────────────────────────────────────
  // -X skips ~/.psqlrc, which can print banner lines into stdout.
  console.log(`Loading band <= ${MAX_SEED_BAND} words from common.words...`)
  const sql = `\\copy (
    select word, difficulty from common.words
     where american and british and crude = 0 and slur = 0 and not slang
       and difficulty <= ${MAX_SEED_BAND}
       and length(word) >= ${MIN_LEN}
  ) to stdout with (format csv, delimiter E'\\t')`
  const raw = execFileSync('psql', [DB_URL, '-X', '-v', 'ON_ERROR_STOP=1', '-c', sql], {
    encoding: 'utf8',
    maxBuffer: 1 << 30,
  })

  type Word = { word: string; band: number; mask: number; first: number; last: number }
  const pool: Word[] = []
  let droppedDoubled = 0
  let droppedWide = 0
  for (const line of raw.split('\n')) {
    if (!line) continue
    const tab = line.indexOf('\t')
    const word = line.slice(0, tab)
    if (hasDoubledLetter(word)) {
      droppedDoubled++
      continue
    }
    const mask = maskOf(word)
    if (popcount(mask) > BOARD_SIZE) {
      droppedWide++
      continue
    }
    pool.push({
      word,
      band: +line.slice(tab + 1),
      mask,
      first: word.charCodeAt(0) - A,
      last: word.charCodeAt(word.length - 1) - A,
    })
  }
  console.log(
    `  ${pool.length} usable (dropped ${droppedDoubled} doubled-letter, ` +
      `${droppedWide} over-${BOARD_SIZE}-letter)`,
  )

  // Boards whose twelve letters ARE a single word would be solvable in one
  // move. The builder makes the exact check (that word also has to be playable
  // on the chosen partition), but the obvious cases are free to drop here.
  const oneWordSets = new Set<string>()
  for (const w of pool) if (popcount(w.mask) === BOARD_SIZE) oneWordSets.add(lettersOf(w.mask))

  // ── index by (joining letter, mask) ─────────────────────────────────────
  // For the pair search only the MASK matters (plus the first/last letter), and
  // many words share a mask, so dedupe hard and keep the easiest representative.
  type Rep = { band: number; word: string }
  const endsWith: Map<number, Rep>[] = Array.from({ length: 26 }, () => new Map())
  const startsWith: Map<number, Rep>[] = Array.from({ length: 26 }, () => new Map())
  for (const w of pool) {
    const e = endsWith[w.last]!.get(w.mask)
    if (!e || w.band < e.band) endsWith[w.last]!.set(w.mask, { band: w.band, word: w.word })
    const s = startsWith[w.first]!.get(w.mask)
    if (!s || w.band < s.band) startsWith[w.first]!.set(w.mask, { band: w.band, word: w.word })
  }

  // Bucket the start-side masks by popcount so the inner loop can skip masks
  // that can't possibly reach twelve. Both words contain the joining letter, so
  // popcount(a) + popcount(b) >= BOARD_SIZE + 1 is necessary.
  type Cand = { mask: number; band: number; word: string }
  const startBuckets: Cand[][][] = Array.from({ length: 26 }, () =>
    Array.from({ length: BOARD_SIZE + 1 }, () => [] as Cand[]),
  )
  for (let L = 0; L < 26; L++) {
    for (const [mask, rep] of startsWith[L]!) {
      startBuckets[L]![popcount(mask)]!.push({ mask, band: rep.band, word: rep.word })
    }
  }

  // ── the pair scan ───────────────────────────────────────────────────────
  // A seed is a twelve-letter SET; its difficulty is the band of the EASIEST
  // pair producing it, so we keep the minimum over all pairs.
  console.log('Scanning for chained pairs...')
  const t0 = Date.now()
  type Seed = { difficulty: number; a: string; b: string }
  const seeds = new Map<number, Seed>()
  let tested = 0

  for (let L = 0; L < 26; L++) {
    for (const [mA, repA] of endsWith[L]!) {
      const need = Math.max(1, BOARD_SIZE + 1 - popcount(mA))
      for (let pB = need; pB <= BOARD_SIZE; pB++) {
        const bucket = startBuckets[L]![pB]!
        for (let i = 0; i < bucket.length; i++) {
          tested++
          const union = mA | bucket[i]!.mask
          if (popcount(union) !== BOARD_SIZE) continue
          const difficulty = Math.max(repA.band, bucket[i]!.band)
          const prev = seeds.get(union)
          if (!prev || difficulty < prev.difficulty) {
            seeds.set(union, { difficulty, a: repA.word, b: bucket[i]!.word })
          }
        }
      }
    }
  }
  console.log(
    `  ${tested.toLocaleString()} pairs tested in ${((Date.now() - t0) / 1000).toFixed(1)}s`,
  )

  // ── emit ────────────────────────────────────────────────────────────────
  const rows: [string, string, string, number][] = []
  const byBand = [0, 0, 0, 0, 0, 0]
  let droppedOneWord = 0
  let droppedUnpartitionable = 0
  for (const [mask, seed] of seeds) {
    const letters = lettersOf(mask)
    if (oneWordSets.has(letters)) {
      droppedOneWord++
      continue
    }
    if (!partitionable(letters, [seed.a, seed.b])) {
      droppedUnpartitionable++
      continue
    }
    byBand[seed.difficulty - 1]!++
    rows.push([letters, seed.a, seed.b, seed.difficulty])
  }
  console.log(
    `Kept ${rows.length.toLocaleString()} seeds ` +
      `(dropped ${droppedOneWord} solvable-in-one-word, ` +
      `${droppedUnpartitionable} unpartitionable).`,
  )
  console.log(`  seeds by band 1..${MAX_SEED_BAND}: ${byBand.slice(0, MAX_SEED_BAND).join(' / ')}`)

  console.log(`Loading ${rows.length.toLocaleString()} seed rows via COPY...`)
  // `mask` is a generated column — omitted from the COPY column list, it
  // self-fills from `letters`.
  copyLoad(DB_URL, 'letterboxed.seeds', ['letters', 'word_a', 'word_b', 'difficulty'], rows)
  console.log('Done.')
}

main()
