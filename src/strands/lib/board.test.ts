import { describe, expect, it } from 'vitest'
import {
  adjacent,
  CELLS,
  consumedCells,
  coordKey,
  inBounds,
  isValidPath,
  samePath,
  wordFromPath,
  type Coord,
} from './board'
import { FIXTURES } from './oracle.fixture'

const BOARD = FIXTURES[0].board

describe('adjacent', () => {
  it('accepts all eight neighbours', () => {
    const around: Coord[] = [
      [2, 2], [2, 3], [2, 4],
      [3, 2], /*  */ [3, 4],
      [4, 2], [4, 3], [4, 4],
    ]
    for (const n of around) expect(adjacent([3, 3], n)).toBe(true)
  })

  it('accepts DIAGONALS — the rule a 4-way tracer would get wrong', () => {
    // Not a stylistic choice: every sampled NYT puzzle uses diagonal steps, so
    // 4-way adjacency can't enter most boards at all. The oracle test below is
    // the exhaustive version of this assertion.
    expect(adjacent([1, 1], [2, 0])).toBe(true)
    expect(adjacent([1, 1], [0, 2])).toBe(true)
  })

  it('rejects a cell against itself', () => {
    expect(adjacent([3, 3], [3, 3])).toBe(false)
  })

  it('rejects a knight move and anything further', () => {
    expect(adjacent([3, 3], [1, 2])).toBe(false)
    expect(adjacent([0, 0], [7, 5])).toBe(false)
  })
})

describe('inBounds', () => {
  it('accepts the corners of an 8×6 board', () => {
    for (const c of [[0, 0], [0, 5], [7, 0], [7, 5]] as Coord[]) expect(inBounds(c)).toBe(true)
  })

  it('rejects off-board and non-integer coords', () => {
    // [3,7] is the shape a [row,col] → [col,row] flip produces, which is
    // exactly how the importer catches a feed change.
    for (const c of [[-1, 0], [8, 0], [0, 6], [3, 7], [1.5, 2]] as Coord[]) {
      expect(inBounds(c)).toBe(false)
    }
  })
})

describe('wordFromPath', () => {
  it('spells the word a path traces', () => {
    const { spangram, spangramCoords } = FIXTURES[0]
    expect(wordFromPath(BOARD, spangramCoords)).toBe(spangram)
  })

  it('is empty for an empty path', () => {
    expect(wordFromPath(BOARD, [])).toBe('')
  })
})

describe('isValidPath', () => {
  const P: Coord[] = [[0, 0], [0, 1], [1, 2]]

  it('accepts a contiguous non-repeating path, diagonals included', () => {
    expect(isValidPath(P)).toBe(true)
  })

  it('accepts a single cell — length is an acceptance rule, not a shape rule', () => {
    // A 2-cell trace still has to reach the server: only IT knows whether the
    // path is a (possibly short) theme word, so "too short" can't be decided here.
    expect(isValidPath([[4, 4]])).toBe(true)
  })

  it('rejects an empty path', () => {
    expect(isValidPath([])).toBe(false)
  })

  it('rejects a jump between non-adjacent cells', () => {
    expect(isValidPath([[0, 0], [0, 1], [4, 4]])).toBe(false)
  })

  it('rejects revisiting a cell', () => {
    expect(isValidPath([[0, 0], [0, 1], [0, 0]])).toBe(false)
  })

  it('rejects an out-of-bounds cell', () => {
    expect(isValidPath([[0, 0], [0, 6]])).toBe(false)
  })
})

describe('samePath', () => {
  it('is order-sensitive — a reversed trace is a different path', () => {
    const a: Coord[] = [[0, 0], [0, 1]]
    expect(samePath(a, [[0, 0], [0, 1]])).toBe(true)
    expect(samePath(a, [[0, 1], [0, 0]])).toBe(false)
    expect(samePath(a, [[0, 0]])).toBe(false)
  })
})

describe('consumedCells', () => {
  it('collects every cell of every found word', () => {
    const consumed = consumedCells([
      { path: [[0, 0], [0, 1]] },
      { path: [[7, 5]] },
    ])
    expect(consumed).toEqual(new Set(['0,0', '0,1', '7,5']))
  })

  it('is empty at the start of a game', () => {
    expect(consumedCells([]).size).toBe(0)
  })

  it('finding every theme word consumes the WHOLE board', () => {
    // The tiling invariant, restated as the win condition: theme words plus the
    // spangram cover all 48 cells exactly, so "all found" and "board consumed"
    // are the same statement — which is why nothing tracks them separately.
    const f = FIXTURES[0]
    const all = [
      { path: f.spangramCoords },
      ...f.themeWords.map((w) => ({ path: f.themeCoords[w] })),
    ]
    expect(consumedCells(all).size).toBe(CELLS)
  })
})

describe('coordKey', () => {
  it('distinguishes transposed coords', () => {
    // [1,2] and [2,1] must never collide — a key that packed them the same way
    // would silently break consumed-cell tracking on non-square boards.
    expect(coordKey([1, 2])).not.toBe(coordKey([2, 1]))
  })
})
