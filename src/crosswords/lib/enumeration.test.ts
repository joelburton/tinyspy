// cs-unmet

import { describe, expect, it } from 'vitest'
import { makeEnumeration } from './enumeration'
import { makeCellId } from './cellId'
import type { GBoard, GCell, GCellPos } from '../types'

/** A board holding just the given cells, each with the facts it is given. */
function board(...cells: [row: number, col: number, patch: Partial<GCell>][]): GBoard {
  const list: GCell[] = cells.map(([row, col, patch]) => ({
    id: makeCellId(row, col), row, col,
    fill: null, pencil: false, wrong: false, revealed: false,
    markRight: null, markBottom: null, writer: null,
    ...patch,
  }))
  return { cells: list, cellsById: Object.fromEntries(list.map((c) => [c.id, c])) }
}
// A horizontal word of `n` cells at row 0.
const word = (n: number): GCellPos[] => Array.from({ length: n }, (_, i) => ({ row: 0, col: i }))

describe('makeEnumeration', () => {
  it('no marks → just the word length', () => {
    expect(makeEnumeration(word(7), board(), 'across')).toBe('(7)')
  })

  it('a break mark splits with a comma', () => {
    expect(makeEnumeration(word(7), board([0, 3, { markRight: 'break' }]), 'across')).toBe('(4,3)')
  })

  it('a hyphen mark splits with a hyphen', () => {
    expect(makeEnumeration(word(5), board([0, 2, { markRight: 'hyphen' }]), 'across')).toBe('(3-2)')
  })

  it('ignores a mark on the last cell (nothing follows it)', () => {
    expect(makeEnumeration(word(7), board([0, 6, { markRight: 'break' }]), 'across')).toBe('(7)')
  })

  it('reads markBottom for a down word', () => {
    const down: GCellPos[] = Array.from({ length: 4 }, (_, i) => ({ row: i, col: 0 }))
    expect(makeEnumeration(down, board([1, 0, { markBottom: 'break' }]), 'down')).toBe('(2,2)')
  })

  it('mixes break + hyphen in one word (exercises the separator index)', () => {
    // 7 cells: a break after cell 1, a hyphen after cell 4 → (2,3-2). The
    // separators array must line up with segments 1 and 2 respectively — the
    // likeliest off-by-one in the join loop.
    const marked = board([0, 1, { markRight: 'break' }], [0, 4, { markRight: 'hyphen' }])
    expect(makeEnumeration(word(7), marked, 'across')).toBe('(2,3-2)')
  })

  it('counts a given cell (absent from the board) toward the length', () => {
    // Cell (0,3) is a given → no cell on the board → its mark reads undefined
    // (no spurious split), but it still adds 1 to the running segment length.
    // Only the real break at (0,1) splits: (2,3).
    expect(makeEnumeration(word(5), board([0, 1, { markRight: 'break' }]), 'across')).toBe('(2,3)')
  })
})
