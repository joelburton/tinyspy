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
 * ## Why it's a cycle-decomposition problem, not a greedy scan
 *
 * Look only at the cells that differ. Each one is a directed edge
 * `have → need` in a multigraph over letters; the whole graph is
 * balanced (every letter is needed exactly as often as it's held), so
 * its edges partition into directed cycles. A cycle of length k is
 * fixed by k−1 swaps (rotate the k tiles into place), so a partition
 * into `c` cycles covering `m` misplaced cells costs `m − c` swaps.
 * The minimum over all valid play is therefore `m − maxCycles` — we
 * want the partition with the MOST cycles.
 *
 * With distinct letters the partition is unique (each tile has exactly
 * one home), so any reasonable method agrees. But a Waffle board is
 * full of duplicate letters (many S's, E's), and duplicates give
 * freedom: the same edges can be carved into different numbers of
 * cycles. A left-to-right greedy commits to one pairing and routinely
 * merges what could be several short cycles into one long one —
 * inflating par (it over-counted ~220/300 of the generated library by
 * up to 4). So we compute `maxCycles` exactly.
 *
 * Holes match holes, so they never differ and contribute no edges.
 *
 * Exact, and trivially fast at Waffle scale (≤21 filled cells, a
 * handful of distinct letters): called once per generated scramble.
 */
export function minSwaps(a: string, b: string): number {
  // counts: "have>need" → how many differing cells need that transition
  const counts = new Map<string, number>()
  let misplaced = 0
  for (let i = 0; i < a.length; i++) {
    if (a[i] === b[i]) continue
    const edge = `${a[i]}>${b[i]}`
    counts.set(edge, (counts.get(edge) ?? 0) + 1)
    misplaced++
  }
  return misplaced - maxCycles(counts, misplaced, new Map())
}

/**
 * Maximum number of disjoint directed cycles the edge multiset
 * `counts` partitions into. Exact search: anchor on any one remaining
 * edge — every partition must place it in SOME cycle — enumerate every
 * simple cycle through it, and recurse on the leftover, taking the
 * best. Memoised on the edge-multiset signature so the heavy overlap
 * between branches collapses. `remaining` is the live edge total.
 */
function maxCycles(
  counts: Map<string, number>,
  remaining: number,
  memo: Map<string, number>,
): number {
  if (remaining === 0) return 0
  const sig = signature(counts)
  const cached = memo.get(sig)
  if (cached !== undefined) return cached

  // Anchor: lexicographically-first edge with a positive count.
  let anchor = ''
  for (const [edge, n] of [...counts].sort()) {
    if (n > 0) {
      anchor = edge
      break
    }
  }
  const [start, next] = anchor.split('>')

  let best = 0
  // Walk simple cycles start → next → … → start, consuming edges as we
  // go; on closing, recurse on whatever's left. `used` counts edges
  // spent in THIS cycle (anchor + path) so the recursion gets the right
  // live total. `visited` keeps cycles simple — a vertex repeat could
  // always be split into more cycles, so simple cycles suffice for the
  // maximum.
  const walk = (node: string, visited: Set<string>, used: number) => {
    for (const [edge, n] of counts) {
      if (n <= 0) continue
      const [from, to] = edge.split('>')
      if (from !== node) continue
      counts.set(edge, n - 1)
      if (to === start) {
        best = Math.max(best, 1 + maxCycles(counts, remaining - used, memo))
      } else if (!visited.has(to)) {
        visited.add(to)
        walk(to, visited, used + 1)
        visited.delete(to)
      }
      counts.set(edge, n)
    }
  }
  counts.set(anchor, counts.get(anchor)! - 1)
  // The anchor edge is consumed; walk() spends `used` more before
  // closing, so a closed cycle has spent `used` edges in total.
  walk(next, new Set([start, next]), 2)
  counts.set(anchor, counts.get(anchor)! + 1)

  memo.set(sig, best)
  return best
}

/** Canonical key for an edge multiset (drops spent edges). */
function signature(counts: Map<string, number>): string {
  return [...counts]
    .filter(([, n]) => n > 0)
    .sort()
    .map(([edge, n]) => `${edge}:${n}`)
    .join(',')
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
