/**
 * The **parity oracle**: NYT's own word lists, replayed through our adjacency
 * and no-reuse rules.
 *
 * boggle has `boggle-c-solver/` for this — an independent implementation whose
 * agreement means more than any hand-written case, because it was produced
 * without knowledge of our code. strands gets the same thing for free: the feed
 * ships `solutions`, ~2500 words across the two fixtures that NYT asserts are
 * findable on those boards. If our tracer disagrees with even one, our rules
 * are wrong.
 *
 * This is what established 8-way adjacency in the first place. Under 4-way, the
 * great majority of these words become untraceable — the "diagonals are
 * allowed" test below is that failure, pinned deliberately so the rule can't be
 * quietly narrowed later.
 *
 * The search here is a TEST HARNESS, not app code, and lives in the test file
 * on purpose: the app never needs to find a word on a board (the server
 * classifies submissions, and the FE only validates the path the player
 * actually traced). Shipping an unused solver in `lib/` to serve a test would
 * be backwards.
 */

import { describe, expect, it } from 'vitest'
import { adjacent, COLS, ROWS, type Board, type Coord } from './board'
import { FIXTURES } from './oracle.fixture'

/**
 * Can `word` be traced on `board` — contiguous under the given adjacency rule,
 * never reusing a cell? Depth-first with backtracking; the boards are 48 cells
 * and the words ≤ 9 letters, so the naive search is instant.
 *
 * `isAdjacent` is a parameter so the 4-way counter-test can run the identical
 * search under a narrower rule and show the difference is the RULE, not the
 * search.
 */
function canTrace(
  board: Board,
  word: string,
  isAdjacent: (a: Coord, b: Coord) => boolean = adjacent,
): boolean {
  const walk = (i: number, at: Coord, used: Set<string>): boolean => {
    if (i === word.length) return true
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const key = `${r},${c}`
        if (used.has(key) || board[r][c] !== word[i] || !isAdjacent(at, [r, c])) continue
        used.add(key)
        if (walk(i + 1, [r, c], used)) return true
        used.delete(key)
      }
    }
    return false
  }

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (board[r][c] !== word[0]) continue
      if (walk(1, [r, c], new Set([`${r},${c}`]))) return true
    }
  }
  return false
}

describe.each(FIXTURES)('oracle — NYT $date', (f) => {
  it(`traces every one of NYT's ${f.solutions.length} solutions`, () => {
    const untraceable = f.solutions.filter((w) => !canTrace(f.board, w))
    expect(untraceable).toEqual([])
  })

  it('traces every theme word and the spangram', () => {
    const words = [f.spangram, ...f.themeWords]
    expect(words.filter((w) => !canTrace(f.board, w))).toEqual([])
  })

  it('rejects a word that is not on the board at all', () => {
    // Guards the guard: a canTrace that returned true unconditionally would
    // pass every assertion above and prove nothing.
    expect(canTrace(f.board, 'ZZZZZZ')).toBe(false)
  })

  it('4-WAY adjacency would break the great majority — the rule is load-bearing', () => {
    const orthogonalOnly = ([r1, c1]: Coord, [r2, c2]: Coord) =>
      Math.abs(r1 - r2) + Math.abs(c1 - c2) === 1
    const traceable = f.solutions.filter((w) => canTrace(f.board, w, orthogonalOnly))
    // Not merely "some fail" — most do. Stated as a ratio so the assertion says
    // what it means: diagonals aren't an edge case in this game, they're normal.
    expect(traceable.length).toBeLessThan(f.solutions.length / 2)
  })
})

describe('oracle — the theme placements agree with the stored coords', () => {
  it.each(FIXTURES)('$date: every stored path is contiguous and spells its word', (f) => {
    const entries: Array<[string, Coord[]]> = [
      [f.spangram, f.spangramCoords],
      ...f.themeWords.map((w) => [w, f.themeCoords[w]] as [string, Coord[]]),
    ]
    for (const [word, coords] of entries) {
      expect(coords).toHaveLength(word.length)
      coords.forEach(([r, c], i) => {
        expect(f.board[r][c]).toBe(word[i])
        if (i > 0) expect(adjacent(coords[i - 1], coords[i])).toBe(true)
      })
    }
  })
})
