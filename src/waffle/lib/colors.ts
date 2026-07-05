/**
 * Waffle's green/yellow/gray feedback, ported to TypeScript from the SQL
 * `waffle.compute_colors` (the board merger, migration `20260624000000_waffle.sql`)
 * and the shared `common.wordle_colors` algorithm it wraps. The server stays the
 * source of truth for LIVE
 * colors (it computes them in `submit_swap` + the read view); this port exists so
 * the turn-history viewer can color a *historical* board on the frontend — replaying
 * past board states needs their colors, and those are a pure function of
 * `(board, solution)` that we'd otherwise have to round-trip to the server for.
 *
 * Because there are now two copies of this subtle algorithm, `colors.test.ts`
 * pins the TS port against **the exact vectors from the pgTAP `colors_test.sql`
 * oracle** — if the SQL ever changes, that test catches the drift. See
 * docs/playarea-decomposition-plan.md (turn-history rollout) and
 * docs/games/waffle.md → "Color feedback".
 */
import { WORDS, lettersAt, HOLE, CELLS } from './waffle'

/** Merge rank for an intersection cell: green beats yellow beats gray beats hole. */
function rank(c: string): number {
  return c === 'g' ? 3 : c === 'y' ? 2 : c === 'x' ? 1 : 0
}

/**
 * Color ONE 5-letter word, Wordle-style → a same-length `g`/`y`/`x` string.
 * Two passes with the standard duplicate-letter accounting (mirrors the SQL
 * `common.wordle_colors`): greens first, so each correct-place letter claims its answer
 * copy; then yellows from the leftover pool, left-to-right, so a guess letter only
 * earns a yellow while an unconsumed copy remains in the answer.
 */
export function wordleColors(guess: string, answer: string): string {
  guess = guess.toLowerCase()
  answer = answer.toLowerCase()
  const n = guess.length
  const res: string[] = new Array(n).fill('x')
  const pool = new Array<number>(26).fill(0) // answer letters left after greens

  // Pass 1: greens. Non-green answer letters go into the pool.
  for (let i = 0; i < n; i++) {
    if (guess[i] === answer[i]) {
      res[i] = 'g'
    } else {
      const idx = answer.charCodeAt(i) - 97 // 'a' → 0 … 'z' → 25
      if (idx >= 0 && idx < 26) pool[idx]++
    }
  }

  // Pass 2: yellows, consuming from the pool left-to-right.
  for (let i = 0; i < n; i++) {
    if (res[i] !== 'g') {
      const idx = guess.charCodeAt(i) - 97
      if (idx >= 0 && idx < 26 && pool[idx] > 0) {
        res[i] = 'y'
        pool[idx]--
      }
    }
  }

  return res.join('')
}

/**
 * Color a whole 25-char board against the 25-char solution → a 25-char `g`/`y`/`x`
 * string with holes left as `.`. Colors each of the 6 words independently, then
 * merges per cell: an intersection cell (in two words) shows the STRONGER of its
 * two colors. Mirrors the SQL `compute_colors` exactly.
 */
export function computeColors(board: string, solution: string): string {
  const res: string[] = new Array(CELLS).fill(HOLE) // holes stay '.'
  for (const cells of WORDS) {
    const wc = wordleColors(lettersAt(board, cells), lettersAt(solution, cells))
    for (let k = 0; k < cells.length; k++) {
      const cell = cells[k]
      if (rank(wc[k]) > rank(res[cell])) res[cell] = wc[k]
    }
  }
  return res.join('')
}
