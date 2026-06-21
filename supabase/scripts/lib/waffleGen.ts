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
const SCRAMBLE_TRIES = 400

export type WordRow = { word: string; difficulty: number }
export type WafflePuzzle = {
  solution: string
  scramble: string
  par: number
  tier: number
}

/** Load 5-letter candidate words (+ their difficulty) from the
 *  committed `words.tsv.gz`: valid in american OR british, not a slur. */
export function loadWordRows(path: string): WordRow[] {
  const raw = gunzipSync(readFileSync(path)).toString('utf8')
  const out: WordRow[] = []
  for (const line of raw.split('\n')) {
    if (!line) continue
    // columns: word difficulty american british canadian australian slur len …
    const c = line.split('\t')
    const word = c[0]
    if (word.length !== 5 || !/^[a-z]{5}$/.test(word)) continue
    if (c[6] === 't') continue // slur
    if (c[2] !== 't' && c[3] !== 't') continue // american OR british
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
    for (let s = 0; s < n; s++) {
      const i = pick(FILLED)
      let j = pick(FILLED)
      while (j === i) j = pick(FILLED)
      ;[arr[i], arr[j]] = [arr[j], arr[i]]
    }
    const scramble = arr.join('')
    if (scramble === solution) continue
    const par = minSwaps(scramble, solution)
    if (par >= PAR_MIN && par <= PAR_MAX) return { scramble, par }
  }
  return null
}

/**
 * Build a generator for one discrete difficulty tier. A tier-N puzzle
 * uses only words with difficulty ≤ N AND has at least one word at
 * exactly N — so the tier is meaningful: a "50" puzzle genuinely
 * reaches the 50 band rather than accidentally being all-everyday.
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
