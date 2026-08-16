import { describe, expect, it } from 'vitest'
import { turnSnapshot, type HistoryRow } from './history'

const rows: HistoryRow[] = [
  { kind: 'hint', cards: [5], board_after: [1, 2, 3, 4, 5, 6] },
  { kind: 'claim', cards: [1, 2, 3], board_after: [70, 71, 72, 4, 5, 6] },
]

describe('turnSnapshot', () => {
  it('shows the board that row recorded, not the live one', () => {
    // The whole point of storing board_after: no replay, no second
    // implementation of the deal rule to disagree with the server's.
    expect(turnSnapshot(rows, 0)!.board).toEqual([1, 2, 3, 4, 5, 6])
    expect(turnSnapshot(rows, 1)!.board).toEqual([70, 71, 72, 4, 5, 6])
  })

  it('rings the cards that turn was about', () => {
    expect(turnSnapshot(rows, 0)!.highlight).toEqual([5])
    expect(turnSnapshot(rows, 1)!.highlight).toEqual([1, 2, 3])
  })

  it('names the turn, and says how far a hint went', () => {
    expect(turnSnapshot(rows, 0)!.description).toBe('Turn 1 — hint (1 of 3)')
    expect(turnSnapshot(rows, 1)!.description).toBe('Turn 2 — set claimed')
  })

  it('returns null for a turn that is not there', () => {
    expect(turnSnapshot(rows, 9)).toBeNull()
    expect(turnSnapshot([], 0)).toBeNull()
  })
})
