/**
 * Pure waffle (waffle) board generation — geometry, the exact
 * minimum-swaps par calculation, and the board fill + anchored
 * scramble. No IO, no Deno/Node specifics, so it's importable by both
 * the edge function (index.ts) and the `deno test` in gen_test.ts.
 *
 * This is the single home of the generation logic now that waffle
 * builds boards on demand (no pre-generated puzzle library). The FE
 * keeps its own copy of the *geometry* constants in
 * src/waffle/lib/waffle.ts for rendering — those are invariant (the
 * board's shape), so the small duplication carries no drift risk; the
 * subtle piece, `minSwaps`, lives only here.
 */

// ─── Geometry ───────────────────────────────────────────────
// Row-major positions 0–24. Words run across rows 0/2/4 and down
// columns 0/2/4; the 4 interior cells where row and column are both
// odd belong to no word and are "holes".
export const GRID = 5
export const CELLS = GRID * GRID // 25
export const HOLE = '.'
export const HOLES: readonly number[] = [6, 8, 16, 18]

export function isHole(pos: number): boolean {
  return HOLES.includes(pos)
}

/** The 21 filled (letter-bearing) positions, ascending. */
export const FILLED: readonly number[] = Array.from(
  { length: CELLS },
  (_, i) => i,
).filter((i) => !isHole(i))

/** The 6 words as ordered cell-index tuples, canonical order
 *  (3 across, then 3 down). */
export const WORDS: readonly (readonly number[])[] = [
  [0, 1, 2, 3, 4], // a0 — across, row 0
  [10, 11, 12, 13, 14], // a2 — across, row 2
  [20, 21, 22, 23, 24], // a4 — across, row 4
  [0, 5, 10, 15, 20], // d0 — down, col 0
  [2, 7, 12, 17, 22], // d2 — down, col 2
  [4, 9, 14, 19, 24], // d4 — down, col 4
]

/**
 * Build the 25-char solution board from the 6 words, given in
 * canonical `WORDS` order `[a0, a2, a4, d0, d2, d4]`. Holes stay '.'.
 * Assumes the words agree at the 9 intersection cells (the fill
 * guarantees this by construction).
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

/** The largest count of any single letter across the 21 filled cells —
 *  a quality signal (too many duplicates makes the color feedback
 *  mushy). */
export function maxLetterFrequency(solution: string): number {
  const counts = new Map<string, number>()
  for (const pos of FILLED) {
    const ch = solution[pos]
    counts.set(ch, (counts.get(ch) ?? 0) + 1)
  }
  return Math.max(...counts.values())
}

// ─── Minimum swaps (par) ────────────────────────────────────
/**
 * Minimum number of tile swaps to turn board `a` into board `b` (same
 * letter multiset). The puzzle's **par**.
 *
 * Each differing cell is a directed edge `have → need` in a multigraph
 * over letters; the edges partition into cycles, and a length-k cycle
 * costs k−1 swaps. So the minimum is `misplaced − maxCycles` — we want
 * the partition with the MOST cycles. Duplicate letters give freedom
 * in how cells pair up; a greedy scan over-counts, so we compute
 * `maxCycles` exactly. Holes match holes, so they contribute no edges.
 */
export function minSwaps(a: string, b: string): number {
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

/** Max disjoint directed cycles the edge multiset partitions into.
 *  Exact memoized search: anchor on any one remaining edge, enumerate
 *  every simple cycle through it, recurse on the leftover. */
function maxCycles(
  counts: Map<string, number>,
  remaining: number,
  memo: Map<string, number>,
): number {
  if (remaining === 0) return 0
  const sig = signature(counts)
  const cached = memo.get(sig)
  if (cached !== undefined) return cached

  let anchor = ''
  for (const [edge, n] of [...counts].sort()) {
    if (n > 0) {
      anchor = edge
      break
    }
  }
  const [start, next] = anchor.split('>')

  let best = 0
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

// ─── Scramble (anchored, par-banded) ────────────────────────
/** Scramble par band — the budget is par + extra. */
const PAR_MIN = 9
const PAR_MAX = 11
/** Reject boards with any letter repeated more than this. */
const MAX_LETTER_FREQ = 5
const SCRAMBLE_TRIES = 2000

/**
 * Cells locked green (already correct) in every starting board — the
 * four corners and the center. Mirrors the real Waffle, whose daily
 * boards always anchor exactly these five. We keep them by simply
 * never moving those tiles when scrambling.
 */
export const ANCHORS: readonly number[] = [0, 4, 12, 20, 24]
const SCRAMBLE_CELLS = FILLED.filter((c) => !ANCHORS.includes(c))

/** Total green (already-correct) cells a starting board may show. The
 *  5 anchors are always green, so this caps incidental greens at 3. */
const GREENS_MIN = 5
const GREENS_MAX = 8

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

/** Scramble `solution` to an arrangement whose par lands in the band,
 *  keeping the corners + center green and total greens in 5–8; null if
 *  it can't within SCRAMBLE_TRIES. */
function makeScramble(
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
    const greens = FILLED.filter((c) => scramble[c] === solution[c]).length
    if (greens < GREENS_MIN || greens > GREENS_MAX) continue
    const par = minSwaps(scramble, solution)
    if (par >= PAR_MIN && par <= PAR_MAX) return { scramble, par }
  }
  return null
}

// ─── Board fill ─────────────────────────────────────────────
export type WordRow = { word: string; difficulty: number }
export type GenBoard = { solution: string; scramble: string; par: number }

/**
 * Build one valid waffle board at exactly band `band` from the
 * candidate words. Returns `{ solution, scramble, par }`, or null if it
 * can't within `maxAttempts`.
 *
 * The fill trick: fixing the 3 across words fixes the 3 down words'
 * intersection letters, so index candidates by their (char@0,@2,@4)
 * triple and look the down words up in O(1). A board is kept only if
 * its hardest word is **exactly** band N (so the tier is meaningful),
 * all 6 words are distinct, the letter-frequency is sane, and it
 * scrambles into the par band with anchored greens.
 */
export function buildWaffleBoard(
  rows: readonly WordRow[],
  band: number,
  maxAttempts = 2_000_000,
): GenBoard | null {
  const candidates = rows.filter((r) => r.difficulty <= band)
  const words = candidates.map((r) => r.word)
  if (words.length === 0) return null
  const diffOf = new Map(candidates.map((r) => [r.word, r.difficulty]))

  // Down-word lookup index: (char@0, char@2, char@4) → words.
  const byOuter = new Map<string, string[]>()
  for (const w of words) {
    const key = w[0] + w[2] + w[4]
    const list = byOuter.get(key)
    if (list) list.push(w)
    else byOuter.set(key, [w])
  }

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
    // The band must be genuinely reached (hardest word is exactly N).
    if (Math.max(...ws.map((w) => diffOf.get(w)!)) !== band) continue
    const solution = assembleSolution(ws)
    if (maxLetterFrequency(solution) > MAX_LETTER_FREQ) continue
    const sc = makeScramble(solution)
    if (!sc) continue
    return { solution, scramble: sc.scramble, par: sc.par }
  }
  return null
}
