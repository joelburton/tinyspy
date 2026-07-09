import { describe, expect, it } from 'vitest'
import { enumerationFor } from './enumeration'
import { cellKey, type CellState, type CellsMap } from '../hooks/useCells'
import type { CellPos } from './cursor'

function cell(patch: Partial<CellState> = {}): CellState {
  return { fill: null, pencil: false, revealed: false, wrong: false, markRight: null, markBottom: null, version: 0, ...patch }
}
// A horizontal word of `n` cells at row 0.
const word = (n: number): CellPos[] => Array.from({ length: n }, (_, i) => ({ row: 0, col: i }))

describe('enumerationFor', () => {
  it('no marks → just the word length', () => {
    expect(enumerationFor(word(7), new Map(), 'across')).toBe('(7)')
  })

  it('a break mark splits with a comma', () => {
    const cells: CellsMap = new Map([[cellKey(0, 3), cell({ markRight: 'break' })]])
    expect(enumerationFor(word(7), cells, 'across')).toBe('(4,3)')
  })

  it('a hyphen mark splits with a hyphen', () => {
    const cells: CellsMap = new Map([[cellKey(0, 2), cell({ markRight: 'hyphen' })]])
    expect(enumerationFor(word(5), cells, 'across')).toBe('(3-2)')
  })

  it('ignores a mark on the last cell (nothing follows it)', () => {
    const cells: CellsMap = new Map([[cellKey(0, 6), cell({ markRight: 'break' })]])
    expect(enumerationFor(word(7), cells, 'across')).toBe('(7)')
  })

  it('reads markBottom for a down word', () => {
    const down: CellPos[] = Array.from({ length: 4 }, (_, i) => ({ row: i, col: 0 }))
    const cells: CellsMap = new Map([[cellKey(1, 0), cell({ markBottom: 'break' })]])
    expect(enumerationFor(down, cells, 'down')).toBe('(2,2)')
  })

  it('mixes break + hyphen in one word (exercises the separator index)', () => {
    // 7 cells: a break after cell 1, a hyphen after cell 4 → (2,3-2). The
    // separators array must line up with segments 1 and 2 respectively — the
    // likeliest off-by-one in the join loop.
    const cells: CellsMap = new Map([
      [cellKey(0, 1), cell({ markRight: 'break' })],
      [cellKey(0, 4), cell({ markRight: 'hyphen' })],
    ])
    expect(enumerationFor(word(7), cells, 'across')).toBe('(2,3-2)')
  })

  it('counts a given cell (absent from the cells map) toward the length', () => {
    // Cell (0,3) is a given → no entry in the map → its mark reads undefined
    // (no spurious split), but it still adds 1 to the running segment length.
    // Only the real break at (0,1) splits: (2,3).
    const cells: CellsMap = new Map([[cellKey(0, 1), cell({ markRight: 'break' })]])
    expect(enumerationFor(word(5), cells, 'across')).toBe('(2,3)')
  })
})
