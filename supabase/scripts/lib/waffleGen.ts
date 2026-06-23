/**
 * Shared Waffle (SyrupSwap) puzzle-generation helpers, used by both
 * the library generator (`generate-waffle-puzzles.ts`) and the visual
 * sampler (`sample-waffle-puzzles.ts`). Dev-only (IO + randomness);
 * the pure board logic it builds on lives in `src/waffle/lib`.
 */

import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { FILLED } from '../../../src/waffle/lib/waffle'
import {
  assembleSolution,
  maxLetterFrequency,
  minSwaps,
} from '../../../src/waffle/lib/puzzle'

/** Scramble par band (min solving swaps). Budget = par + extra. */
export const PAR_MIN = 9
export const PAR_MAX = 11
/** Reject boards with any letter repeated more than this (keeps the
 *  color feedback crisp). */
const MAX_LETTER_FREQ = 5
const SCRAMBLE_TRIES = 2000

/**
 * Cells locked green (already correct) in every starting board — the
 * four corners and the center: cells 0, 4, 20, 24, and 12. This mirrors
 * the real Waffle, whose daily boards always anchor exactly these five
 * (per the arXiv analysis of 1000+ archived games). The anchors give a
 * solver an immediate foothold; we keep them by simply never moving
 * those tiles when scrambling.
 */
export const ANCHORS: readonly number[] = [0, 4, 12, 20, 24]

/** The 16 filled cells we actually permute (everything but the anchors). */
const SCRAMBLE_CELLS = FILLED.filter((c) => !ANCHORS.includes(c))

/**
 * Total green (already-correct) cells a starting board may show. The
 * real Waffle keeps 5–8 greens so a board is "not too hard or easy."
 * The 5 anchors are always green, so this caps the *incidental* greens
 * among the scrambled cells at 3.
 */
export const GREENS_MIN = 5
export const GREENS_MAX = 8

export type WordRow = { word: string; difficulty: number }
export type WafflePuzzle = {
  solution: string
  scramble: string
  par: number
  tier: number
}

/** Load 5-letter candidate words (+ their difficulty band) from the
 *  committed `words.tsv.gz`: american, not a slur, not slang. */
export function loadWordRows(path: string): WordRow[] {
  const raw = gunzipSync(readFileSync(path)).toString('utf8')
  const out: WordRow[] = []
  for (const line of raw.split('\n')) {
    if (!line) continue
    // columns: word difficulty american british canadian australian
    //          slur slang wordle len root_word definition def_source
    const c = line.split('\t')
    const word = c[0]
    if (word.length !== 5 || !/^[a-z]{5}$/.test(word)) continue
    if (c[2] !== 't') continue // american
    if (c[6] === 't') continue // slur
    if (c[7] === 't') continue // slang
    out.push({ word, difficulty: Number(c[1]) })
  }
  return out
}

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

/** Scramble `solution` to an arrangement whose par lands in the band;
 *  null if it can't within SCRAMBLE_TRIES (caller moves on). */
export function makeScramble(
  solution: string,
): { scramble: string; par: number } | null {
  for (let t = 0; t < SCRAMBLE_TRIES; t++) {
    const arr = solution.split('')
    const n = PAR_MIN + Math.floor(Math.random() * (PAR_MAX - PAR_MIN + 4))
    // Only ever swap non-anchor cells, so the corners + center stay green.
    for (let s = 0; s < n; s++) {
      const i = pick(SCRAMBLE_CELLS)
      let j = pick(SCRAMBLE_CELLS)
      while (j === i) j = pick(SCRAMBLE_CELLS)
      ;[arr[i], arr[j]] = [arr[j], arr[i]]
    }
    const scramble = arr.join('')
    if (scramble === solution) continue
    // Green = a cell already in its solved spot. Anchors are green by
    // construction (never moved); enforce the 5–8 total convention,
    // which here just caps the incidental greens among scrambled cells.
    const greens = FILLED.filter((c) => scramble[c] === solution[c]).length
    if (greens < GREENS_MIN || greens > GREENS_MAX) continue
    const par = minSwaps(scramble, solution)
    if (par >= PAR_MIN && par <= PAR_MAX) return { scramble, par }
  }
  return null
}

/**
 * Build a generator for one discrete difficulty tier (a band 1–5). A
 * tier-N puzzle uses only words with difficulty ≤ N AND has at least
 * one word at exactly N — so the tier is meaningful: a band-3 puzzle
 * genuinely reaches band 3 rather than accidentally being all band-1.
 *
 * Returns `{ candidateCount, next() }`; `next()` yields a fresh puzzle
 * (deduped within this generator) or null if it can't find one.
 */
export function tierGenerator(rows: WordRow[], tier: number) {
  const candidates = rows.filter((r) => r.difficulty <= tier)
  const words = candidates.map((r) => r.word)
  const diffOf = new Map(candidates.map((r) => [r.word, r.difficulty]))

  // Down-word lookup index: (char@0, char@2, char@4) → words.
  const byOuter = new Map<string, string[]>()
  for (const w of words) {
    const key = w[0] + w[2] + w[4]
    const list = byOuter.get(key)
    if (list) list.push(w)
    else byOuter.set(key, [w])
  }

  const seen = new Set<string>()

  return {
    candidateCount: words.length,
    next(maxAttempts = 2_000_000): WafflePuzzle | null {
      for (let a = 0; a < maxAttempts; a++) {
        const a0 = pick(words)
        const a2 = pick(words)
        const a4 = pick(words)
        const d0s = byOuter.get(a0[0] + a2[0] + a4[0])
        const d2s = byOuter.get(a0[2] + a2[2] + a4[2])
        const d4s = byOuter.get(a0[4] + a2[4] + a4[4])
        if (!d0s || !d2s || !d4s) continue
        const ws = [a0, a2, a4, pick(d0s), pick(d2s), pick(d4s)]
        if (new Set(ws).size !== 6) continue // all 6 distinct
        // The tier must be genuinely reached (hardest word is exactly N).
        if (Math.max(...ws.map((w) => diffOf.get(w)!)) !== tier) continue
        const solution = assembleSolution(ws)
        if (seen.has(solution)) continue
        if (maxLetterFrequency(solution) > MAX_LETTER_FREQ) continue
        const sc = makeScramble(solution)
        if (!sc) continue
        seen.add(solution)
        return { solution, scramble: sc.scramble, par: sc.par, tier }
      }
      return null
    },
  }
}
