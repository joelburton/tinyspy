import { describe, expect, it } from 'vitest'
import { covers, depthMap, exposedIds, letterCorner, type Tile } from './board'

/**
 * A minimal two-layer fixture: four base tiles at the corners of a
 * 2×2 footprint, plus one raised tile centered over them. The raised
 * tile is within one cell of all four, so it covers (hides) every base
 * tile until removed.
 *
 *   z=0:  A(0,0)   B(2,0)
 *              E(1,1) z=1
 *         C(0,2)   D(2,2)
 */
const A: Tile = { id: 0, x: 0, y: 0, z: 0, letter: 'A' }
const B: Tile = { id: 1, x: 2, y: 0, z: 0, letter: 'B' }
const C: Tile = { id: 2, x: 0, y: 2, z: 0, letter: 'C' }
const D: Tile = { id: 3, x: 2, y: 2, z: 0, letter: 'D' }
const E: Tile = { id: 4, x: 1, y: 1, z: 1, letter: 'E' }
const board = [A, B, C, D, E]

describe('covers', () => {
  it('a higher tile within one cell covers a lower one', () => {
    expect(covers(E, A)).toBe(true)
    expect(covers(E, D)).toBe(true)
  })
  it('does not cover across a layer when more than one cell away', () => {
    // Same layer never covers (needs strictly higher z).
    expect(covers(A, B)).toBe(false)
    // A hypothetical higher tile two cells away misses the footprint.
    const far: Tile = { id: 9, x: 4, y: 0, z: 1, letter: 'Z' }
    expect(covers(far, A)).toBe(false)
  })
})

describe('exposedIds', () => {
  it('only the raised tile is exposed on the full board', () => {
    expect(exposedIds(board, new Set())).toEqual(new Set([E.id]))
  })
  it('removing the raised tile exposes all four base tiles', () => {
    expect(exposedIds(board, new Set([E.id]))).toEqual(
      new Set([A.id, B.id, C.id, D.id]),
    )
  })
})

describe('depthMap', () => {
  it('exposed tile is depth 0, the covered base tiles are depth 1', () => {
    const depths = depthMap(board)
    expect(depths.get(E.id)).toBe(0)
    expect(depths.get(A.id)).toBe(1)
    expect(depths.get(D.id)).toBe(1)
  })
})

describe('letterCorner', () => {
  it('centers the letter on an exposed tile', () => {
    expect(letterCorner(E, board)).toEqual({ cx: 0, cy: 0 })
  })
  it('tucks the letter away from the covering quadrant', () => {
    // E sits up-and-right of A (toward +x,+y), so A keeps its letter
    // in a free diagonal — the first free one is (-1,-1).
    expect(letterCorner(A, board)).toEqual({ cx: -1, cy: -1 })
  })
  it('re-centers once the coverer is gone', () => {
    expect(letterCorner(A, [A, B, C, D])).toEqual({ cx: 0, cy: 0 })
  })
})
