#!/usr/bin/env -S npx tsx
/**
 * letterboxed seed-yield spike — see docs/letterboxed-plan.md §9.
 *
 * Measures, against the LOCAL common.words:
 *   1. yield of distinct 12-letter sets with a 2-word solution, per band
 *   2. what BFS par actually comes out as (vs the seed's word count)
 *   3. the playable-set size distribution (the CLI's richness floor)
 *   4. how much par + set size move across legal_band
 *
 * Throwaway measurement, not the importer. Run: npx tsx seed-yield.ts
 */

import { execFileSync } from 'node:child_process'

const DB_URL =
  process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

const A = 'a'.charCodeAt(0)
const BOARD_SIZE = 12
const MIN_LEN = 3

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

type Word = { word: string; band: number; mask: number; first: number; last: number }

// ── load ────────────────────────────────────────────────────────────────────
console.log('loading pool…')
const t0 = Date.now()
const sql = `\\copy (
  select word, difficulty from common.words
   where american and british and crude = 0 and slur = 0 and not slang
     and length(word) >= ${MIN_LEN}
) to stdout with (format csv, delimiter E'\\t')`
// -X: skip ~/.psqlrc, which prints banner lines ("Timing is on") into stdout.
const raw = execFileSync('psql', [DB_URL, '-X', '-v', 'ON_ERROR_STOP=1', '-c', sql], {
  encoding: 'utf8',
  maxBuffer: 1 << 30,
})

const pool: Word[] = []
for (const line of raw.split('\n')) {
  if (!line) continue
  const tab = line.indexOf('\t')
  const word = line.slice(0, tab)
  const band = +line.slice(tab + 1)
  const mask = maskOf(word)
  if (popcount(mask) > BOARD_SIZE) continue // can never fit a 12-letter board
  // A doubled letter ('bell') is two consecutive letters on the SAME side by
  // definition, so such a word is unplayable on every possible board.
  let dbl = false
  for (let i = 1; i < word.length; i++) if (word[i] === word[i - 1]) dbl = true
  if (dbl) continue
  pool.push({
    word,
    band,
    mask,
    first: word.charCodeAt(0) - A,
    last: word.charCodeAt(word.length - 1) - A,
  })
}
console.log(`  ${pool.length} words usable (<= ${BOARD_SIZE} distinct letters), ${Date.now() - t0}ms`)

// ── index by (joining letter, mask), keeping the lowest-band representative ──
// For the pair search only the MASK matters (plus first/last letter), and many
// words share a mask, so dedupe hard. We keep a representative word because the
// partition step (below) needs the actual letter sequence, not just the set.
type Rep = { band: number; word: string }
const endsWith: Map<number, Rep>[] = Array.from({ length: 26 }, () => new Map())
const startsWith: Map<number, Rep>[] = Array.from({ length: 26 }, () => new Map())

for (const w of pool) {
  const e = endsWith[w.last].get(w.mask)
  if (!e || w.band < e.band) endsWith[w.last].set(w.mask, { band: w.band, word: w.word })
  const s = startsWith[w.first].get(w.mask)
  if (!s || w.band < s.band) startsWith[w.first].set(w.mask, { band: w.band, word: w.word })
}

// Bucket the start-side masks by popcount so the inner loop can skip masks that
// can't possibly reach 12 (both share the joining letter, so
// popcount(a) + popcount(b) >= 13 is necessary).
const startBuckets: { mask: number; band: number; word: string }[][][] = Array.from(
  { length: 26 },
  () => Array.from({ length: BOARD_SIZE + 1 }, () => [] as { mask: number; band: number; word: string }[]),
)
for (let L = 0; L < 26; L++) {
  for (const [mask, rep] of startsWith[L]) {
    startBuckets[L][popcount(mask)].push({ mask, band: rep.band, word: rep.word })
  }
}

console.log(
  `  distinct masks: ends ${endsWith.reduce((n, m) => n + m.size, 0)}, ` +
    `starts ${startsWith.reduce((n, m) => n + m.size, 0)}`,
)

// ── stage 2: exhaustive 2-word pair search ──────────────────────────────────
// A seed is a 12-letter SET reachable as the union of a chained word pair.
// Band of a seed = min over its solutions of max(bandA, bandB) — the easiest
// pair that solves it, mirroring wordwheel.pangrams.difficulty.
console.log('\npair search…')
const t1 = Date.now()
type Seed = { band: number; a: string; b: string }
const seeds = new Map<number, Seed>()
let pairsTested = 0

for (let L = 0; L < 26; L++) {
  const ends = endsWith[L]
  if (!ends.size) continue
  for (const [mA, repA] of ends) {
    const pA = popcount(mA)
    const need = Math.max(1, 13 - pA)
    for (let pB = need; pB <= BOARD_SIZE; pB++) {
      const bucket = startBuckets[L][pB]
      for (let i = 0; i < bucket.length; i++) {
        pairsTested++
        const union = mA | bucket[i].mask
        if (popcount(union) !== BOARD_SIZE) continue
        const band = Math.max(repA.band, bucket[i].band)
        const prev = seeds.get(union)
        if (!prev || band < prev.band) {
          seeds.set(union, { band, a: repA.word, b: bucket[i].word })
        }
      }
    }
  }
  process.stdout.write(`  ${String.fromCharCode(A + L)}:${seeds.size} `)
}
console.log(
  `\n  ${pairsTested.toLocaleString()} pairs tested, ` +
    `${seeds.size.toLocaleString()} distinct 12-letter sets, ${((Date.now() - t1) / 1000).toFixed(1)}s`,
)

// ── stage 3: yield by band ──────────────────────────────────────────────────
console.log('\n== 2-word seed yield, by band (band = easiest solving pair) ==')
const byBand = new Array(7).fill(0)
for (const s of seeds.values()) byBand[s.band]++
let cum = 0
for (let b = 1; b <= 6; b++) {
  cum += byBand[b]
  console.log(`  band ${b}: ${String(byBand[b]).padStart(7)}   cumulative (<= ${b}): ${cum}`)
}

// ── partition: 4 sides of 3, no consecutive pair on one side ────────────────
// The conflict graph has an edge between letters adjacent in either solution
// word. A valid board is a partition of the 12 letters into 4 groups of 3 with
// no conflict edge inside a group. Randomized backtracking; 12 nodes.
const adjacencyEdges = (letters: number[], words: string[]): number[] => {
  const idx = new Map(letters.map((l, i) => [l, i]))
  const conflict = new Array(BOARD_SIZE).fill(0)
  for (const w of words) {
    for (let i = 1; i < w.length; i++) {
      const u = idx.get(w.charCodeAt(i - 1) - A)!
      const v = idx.get(w.charCodeAt(i) - A)!
      if (u === v) continue // a doubled letter (e.g. 'ee') can never be legal
      conflict[u] |= 1 << v
      conflict[v] |= 1 << u
    }
  }
  return conflict
}

/** Returns sideOf[i] for each of the 12 letter slots, or null if uncolorable. */
const partition = (conflict: number[], rng: () => number): number[] | null => {
  const sideOf = new Array(BOARD_SIZE).fill(-1)
  const sideMembers: number[][] = [[], [], [], []]
  const order = [...Array(BOARD_SIZE).keys()].sort(() => rng() - 0.5)

  const place = (k: number): boolean => {
    if (k === BOARD_SIZE) return true
    const node = order[k]
    const sides = [0, 1, 2, 3].sort(() => rng() - 0.5)
    for (const s of sides) {
      if (sideMembers[s].length >= 3) continue
      if (sideMembers[s].some((m) => conflict[node] & (1 << m))) continue
      sideOf[node] = s
      sideMembers[s].push(node)
      if (place(k + 1)) return true
      sideMembers[s].pop()
      sideOf[node] = -1
    }
    return false
  }
  return place(0) ? sideOf : null
}

// A doubled letter inside a solution word ('bell') makes that word illegal on
// ANY board, so such pairs must be rejected outright.
const hasDoubledLetter = (w: string): boolean => {
  for (let i = 1; i < w.length; i++) if (w[i] === w[i - 1]) return true
  return false
}

// ── the real solver: playable set + BFS par ─────────────────────────────────
type Board = { letters: number[]; sideOf: number[] }

const playableSet = (board: Board, maxBand: number) => {
  const boardMask = board.letters.reduce((m, l) => m | (1 << l), 0)
  const side = new Array(26).fill(-1)
  board.letters.forEach((l, i) => (side[l] = board.sideOf[i]))
  const slot = new Array(26).fill(-1)
  board.letters.forEach((l, i) => (slot[l] = i))

  const out: { mask12: number; first: number; last: number }[] = []
  for (const w of pool) {
    if (w.band > maxBand) continue
    if (w.mask & ~boardMask) continue // uses a letter not on the board
    let ok = true
    let m12 = 0
    const s = w.word
    for (let i = 0; i < s.length; i++) {
      const l = s.charCodeAt(i) - A
      m12 |= 1 << slot[l]
      if (i > 0 && side[l] === side[s.charCodeAt(i - 1) - A]) {
        ok = false
        break
      }
    }
    if (ok) out.push({ mask12: m12, first: slot[s.charCodeAt(0) - A], last: slot[s.charCodeAt(s.length - 1) - A] })
  }
  return out
}

/** Fewest words to cover all 12 letters, or null. BFS over (usedMask, tail). */
const par = (words: { mask12: number; first: number; last: number }[]): number | null => {
  const FULL = (1 << BOARD_SIZE) - 1
  const byFirst: { mask12: number; last: number }[][] = Array.from({ length: BOARD_SIZE }, () => [])
  for (const w of words) byFirst[w.first].push({ mask12: w.mask12, last: w.last })

  const seen = new Uint8Array(4096 * BOARD_SIZE)
  let frontier: number[] = [] // encoded: used * 12 + tail
  for (const w of words) {
    if (w.mask12 === FULL) return 1
    const st = w.mask12 * BOARD_SIZE + w.last
    if (!seen[st]) {
      seen[st] = 1
      frontier.push(st)
    }
  }
  let depth = 1
  while (frontier.length) {
    depth++
    const next: number[] = []
    for (const st of frontier) {
      const used = (st / BOARD_SIZE) | 0
      const tail = st % BOARD_SIZE
      for (const w of byFirst[tail]) {
        const nu = used | w.mask12
        if (nu === FULL) return depth
        const ns = nu * BOARD_SIZE + w.last
        if (!seen[ns]) {
          seen[ns] = 1
          next.push(ns)
        }
      }
    }
    frontier = next
    if (depth > 8) return null
  }
  return null
}

// ── stage 4/5: sample seeds, partition them, measure par + set size ─────────
let rngState = 12345
const rng = () => ((rngState = (rngState * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)

const SAMPLE = Number(process.env.SAMPLE ?? 400)
const BANDS = [1, 2, 3, 4, 5]
console.log(`\n== per-band sampling (${SAMPLE} each): seed_band <= legal_band ==`)
console.log('   the shipping configuration — the seeded solution must itself be legal')

// Bucket seeds by band once so each legal_band can draw from `band <= B`.
const seedsByBand: [number, Seed][][] = Array.from({ length: 7 }, () => [])
for (const [m, s] of seeds) seedsByBand[s.band].push([m, s])

const quantiles = (xs: number[]) => {
  if (!xs.length) return 'n/a'
  const s = [...xs].sort((a, b) => a - b)
  const q = (f: number) => s[Math.min(s.length - 1, Math.floor(f * s.length))]
  return `min ${s[0]} p25 ${q(0.25)} med ${q(0.5)} p75 ${q(0.75)} max ${s[s.length - 1]}`
}

let uncolorableTotal = 0
for (const B of BANDS) {
  const eligible = seedsByBand.slice(1, B + 1).flat()
  const parVals: number[] = []
  const sizes: number[] = []
  let unsolvable = 0
  let uncolorable = 0

  for (let i = 0; i < SAMPLE; i++) {
    const [setMask, seed] = eligible[Math.floor(rng() * eligible.length)]
    const letters: number[] = []
    for (let l = 0; l < 26; l++) if (setMask & (1 << l)) letters.push(l)
    const sideOf = partition(adjacencyEdges(letters, [seed.a, seed.b]), rng)
    if (!sideOf) {
      uncolorable++
      continue
    }
    const ws = playableSet({ letters, sideOf }, B)
    const p = par(ws)
    sizes.push(ws.length)
    if (p === null) unsolvable++
    else parVals.push(p)
  }
  uncolorableTotal += uncolorable

  const hist: Record<number, number> = {}
  for (const p of parVals) hist[p] = (hist[p] ?? 0) + 1
  const par2 = ((100 * (hist[2] ?? 0)) / parVals.length).toFixed(0)
  console.log(`\n  band ${B}  (pool: ${eligible.length.toLocaleString()} seeds)`)
  console.log(`    playable words: ${quantiles(sizes)}`)
  console.log(
    `    par:            ${Object.entries(hist)
      .map(([p, n]) => `${p}w:${n}`)
      .join('  ')}   (${par2}% are par-2)${unsolvable ? `   UNSOLVABLE:${unsolvable}` : ''}`,
  )
}
console.log(`\n  uncolorable boards across all bands: ${uncolorableTotal} / ${SAMPLE * BANDS.length}`)
