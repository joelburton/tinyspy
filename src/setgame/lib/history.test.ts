// cs-unmet

import { describe, expect, it } from 'vitest'
import { historySnapshot, type HistoryRow } from './history'

// The ids are what the viewer addresses, and are deliberately not 0,1 — a
// builder that still indexed would pass by accident.
const rows: HistoryRow[] = [
  { id: 11, kind: 'hint', cards: [5], board_after: [1, 2, 3, 4, 5, 6] },
  { id: 12, kind: 'claim', cards: [1, 2, 3], board_after: [70, 71, 72, 4, 5, 6] },
]

describe('historySnapshot', () => {
  it('shows the board that row recorded, not the live one', () => {
    // The whole point of storing board_after: no replay, no second
    // implementation of the deal rule to disagree with the server's.
    expect(historySnapshot(rows, 11, 1)!.board).toEqual([1, 2, 3, 4, 5, 6])
    expect(historySnapshot(rows, 12, 2)!.board).toEqual([70, 71, 72, 4, 5, 6])
  })

  it('rings the cards that turn was about', () => {
    expect(historySnapshot(rows, 11, 1)!.historyLitCards).toEqual([5])
    expect(historySnapshot(rows, 12, 2)!.historyLitCards).toEqual([1, 2, 3])
  })

  it('names the turn, and says how far a hint went', () => {
    expect(historySnapshot(rows, 11, 1)!.historyLabel).toBe('Turn 1 — hint (1 of 3)')
    expect(historySnapshot(rows, 12, 2)!.historyLabel).toBe('Turn 2 — set claimed')
  })

  it('prints the number it was GIVEN — the log numbers what it shows', () => {
    // Row 12 sits second in this list, and the log that was filtered to one
    // player printed it as "#1". The banner has to say what the reader clicked.
    expect(historySnapshot(rows, 12, 1)!.historyLabel).toBe('Turn 1 — set claimed')
    // No number at all when the opening carried none.
    expect(historySnapshot(rows, 12, null)!.historyLabel).toBe('Turn — set claimed')
  })

  it('returns null for a row that is not there', () => {
    expect(historySnapshot(rows, 99, 1)).toBeNull()
    expect(historySnapshot([], 11, 1)).toBeNull()
  })
})
