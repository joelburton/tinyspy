import { describe, it, expect } from 'vitest'
import { snapshotAt, type HistoryRow } from './history'

// A five-turn session with every interesting row kind: a find, a reject, a
// hint word, the spangram, and a duplicate. Paths are minimal — the filter
// never inspects them, it only carries them through.
const ROWS: readonly HistoryRow[] = [
  { word: 'apple', path: [[0, 0], [0, 1]], result: 'theme' },
  { word: 'zq', path: [[1, 0], [1, 1]], result: 'too_short' },
  { word: 'plane', path: [[2, 0], [2, 1]], result: 'hint_word' },
  { word: 'spanner', path: [[3, 0], [3, 1]], result: 'spangram' },
  { word: 'apple', path: [[0, 0], [0, 1]], result: 'duplicate' },
]

describe('snapshotAt', () => {
  it('is a filter: the board at turn N is the theme finds among rows 0..N', () => {
    expect(snapshotAt(ROWS, 0).found).toEqual([
      { path: [[0, 0], [0, 1]], isSpangram: false },
    ])
    // Rejects and hint words never reach the board.
    expect(snapshotAt(ROWS, 2).found).toEqual(snapshotAt(ROWS, 0).found)
  })

  it('the boundary is INCLUSIVE: viewing a find shows that find placed', () => {
    expect(snapshotAt(ROWS, 3).found).toHaveLength(2)
    expect(snapshotAt(ROWS, 3).found[1]).toEqual({
      path: [[3, 0], [3, 1]],
      isSpangram: true,
    })
  })

  it('highlights the viewed turn even when it changed nothing', () => {
    // A rejected word's cells are exactly what reviewing it wants to see.
    expect(snapshotAt(ROWS, 1).highlight).toEqual([[1, 0], [1, 1]])
    expect(snapshotAt(ROWS, 1).found).toHaveLength(1)
  })

  it('describes the turn in the log wording, 1-indexed', () => {
    expect(snapshotAt(ROWS, 0).description).toBe('#1 APPLE — theme word')
    expect(snapshotAt(ROWS, 1).description).toBe('#2 ZQ — too short')
    expect(snapshotAt(ROWS, 3).description).toBe('#4 SPANNER — spangram')
    expect(snapshotAt(ROWS, 4).description).toBe('#5 APPLE — already found')
  })

  it('tolerates an out-of-range index (the rows shifted under the viewer)', () => {
    const snap = snapshotAt(ROWS, 99)
    expect(snap.highlight).toEqual([])
    expect(snap.description).toBe('')
    // Everything found is still shown — slice just runs off the end.
    expect(snap.found).toHaveLength(2)
  })
})
