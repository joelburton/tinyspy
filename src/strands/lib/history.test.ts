// cs-unmet

import { describe, it, expect } from 'vitest'
import { historySnapshot, type HistoryRow } from './history'

// A six-turn session with every interesting row kind: a find, a reject, a
// hint word, the spangram, a duplicate — and a SPENT HINT, which is the one
// row that isn't a guess. Paths are minimal — the filter never inspects them,
// it only carries them through.
const ROWS: readonly HistoryRow[] = [
  { kind: 'guess', word: 'apple', path: [[0, 0], [0, 1]], result: 'theme' },
  { kind: 'guess', word: 'zq', path: [[1, 0], [1, 1]], result: 'too_short' },
  { kind: 'guess', word: 'plane', path: [[2, 0], [2, 1]], result: 'hint_word' },
  { kind: 'guess', word: 'spanner', path: [[3, 0], [3, 1]], result: 'spangram' },
  { kind: 'guess', word: 'apple', path: [[0, 0], [0, 1]], result: 'duplicate' },
  { kind: 'hint', word: null, path: [[4, 0], [4, 1]], result: null },
]

describe('historySnapshot', () => {
  it('is a filter: the board at turn N is the theme finds among rows 0..N', () => {
    expect(historySnapshot(ROWS, 0).found).toEqual([
      { path: [[0, 0], [0, 1]], isSpangram: false },
    ])
    // Rejects and hint words never reach the board.
    expect(historySnapshot(ROWS, 2).found).toEqual(historySnapshot(ROWS, 0).found)
  })

  it('the boundary is INCLUSIVE: viewing a find shows that find placed', () => {
    expect(historySnapshot(ROWS, 3).found).toHaveLength(2)
    expect(historySnapshot(ROWS, 3).found[1]).toEqual({
      path: [[3, 0], [3, 1]],
      isSpangram: true,
    })
  })

  it('lights the viewed turn even when it changed nothing', () => {
    // A rejected word's cells are exactly what reviewing it wants to see.
    expect(historySnapshot(ROWS, 1).historyLitTiles).toEqual([[1, 0], [1, 1]])
    expect(historySnapshot(ROWS, 1).found).toHaveLength(1)
  })

  it('describes the turn in the log wording, 1-indexed', () => {
    expect(historySnapshot(ROWS, 0).historyLabel).toBe('#1 APPLE — theme word')
    expect(historySnapshot(ROWS, 1).historyLabel).toBe('#2 ZQ — too short')
    expect(historySnapshot(ROWS, 3).historyLabel).toBe('#4 SPANNER — spangram')
    expect(historySnapshot(ROWS, 4).historyLabel).toBe('#5 APPLE — already found')
  })

  describe('a spent hint', () => {
    it('re-rings its revealed cells as a HINT, not as a traced route', () => {
      const snap = historySnapshot(ROWS, 5)
      // The distinction the separate field exists for: replaying a hint as a
      // `historyLitTiles` would draw it as a connected trace, showing an order the
      // hint deliberately never gave.
      expect(snap.hintCoords).toEqual([[4, 0], [4, 1]])
      expect(snap.historyLitTiles).toEqual([])
    })

    it('names the act without naming the word', () => {
      expect(historySnapshot(ROWS, 5).historyLabel).toBe('#6 Hint — a word was revealed')
    })

    it('leaves the board exactly as the finds before it left it', () => {
      // A hint reveals; it never places. So turn 6's board is turn 5's board.
      expect(historySnapshot(ROWS, 5).found).toEqual(historySnapshot(ROWS, 4).found)
    })

    it('carries no hintCoords on a guess turn', () => {
      expect(historySnapshot(ROWS, 0).hintCoords).toBeNull()
    })
  })

  it('tolerates an out-of-range index (the rows shifted under the viewer)', () => {
    const snap = historySnapshot(ROWS, 99)
    expect(snap.historyLitTiles).toEqual([])
    expect(snap.hintCoords).toBeNull()
    expect(snap.historyLabel).toBe('')
    // Everything found is still shown — slice just runs off the end.
    expect(snap.found).toHaveLength(2)
  })
})
