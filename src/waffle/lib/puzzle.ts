/**
 * Waffle puzzle helpers shared by the offline generator
 * (`supabase/scripts/generate-waffle-puzzles.ts`) and tests. Pure
 * functions over the geometry in `./waffle` — no IO, no randomness.
 */

import { CELLS, FILLED, HOLE, isHole, WORDS } from './waffle'

/**
 * Build the 25-char solution board from the 6 words, given in
 * canonical `WORDS` order `[a0, a2, a4, d0, d2, d4]`. Each word's
 * letters are written to its cells; holes stay `.`.
 *
 * Assumes the words are mutually consistent at the 9 intersection
 * cells (the generator guarantees this by construction). A down word
 * re-writing an intersection cell an across word already set is a
 * no-op when they agree — which they must.
 */
export function assembleSolution(words: readonly string[]): string {
  const cells: string[] = Array.from({ length: CELLS }, (_, i) =>
    isHole(i) ? HOLE : '',
  )
  WORDS.forEach((cellIdxs, wi) => {
    const word = words[wi]
    cellIdxs.forEach((cell, k) => {
      cells[cell] = word[k]
    })
  })
  return cells.join('')
}

/**
 * Minimum number of tile swaps to turn board `a` into board `b`
 * (same letter multiset, e.g. a scramble → its solution). This is
 * the puzzle's **par** — the budget is `par + extra`.
 *
 * Greedy with duplicate-letter freedom: scanning left to right, fix
 * each wrong cell by swapping in a donor that holds the needed
 * letter, *preferring* a donor whose own letter we simultaneously
 * place correctly (a "perfect" swap that fixes two cells at once).
 * That preference is what makes it optimal rather than just valid —
 * with distinct letters it reduces to `mismatches − cycles`. Holes
 * match holes, so they're skipped and contribute nothing.
 *
 * O(n²) over 25 cells — trivially fast, called once per generated
 * scramble.
 */
export function minSwaps(a: string, b: string): number {
  const arr = a.split('')
  const target = b.split('')
  let swaps = 0
  for (let i = 0; i < arr.length; i++) {
    if (arr[i] === target[i]) continue
    // A donor always exists (same multiset, prefix already fixed).
    let k = -1
    for (let j = i + 1; j < arr.length; j++) {
      if (arr[j] === target[i]) {
        if (arr[i] === target[j]) {
          k = j // perfect: this one swap fixes both i and j
          break
        }
        if (k === -1) k = j // fallback: fixes i, keep looking for a perfect one
      }
    }
    ;[arr[i], arr[k]] = [arr[k], arr[i]]
    swaps++
  }
  return swaps
}

/** The largest count of any single letter across the 21 filled cells
 *  — a quality signal (too many duplicates makes the color feedback
 *  mushy). */
export function maxLetterFrequency(solution: string): number {
  const counts = new Map<string, number>()
  for (const pos of FILLED) {
    const ch = solution[pos]
    counts.set(ch, (counts.get(ch) ?? 0) + 1)
  }
  return Math.max(...counts.values())
}
