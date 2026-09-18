// cs-unmet

import { describe, it, expect } from 'vitest'
import { historySnapshot } from './history'
import type { EventRow } from '../hooks/useGame'

/** A guess row, defaulting the fields the snapshot ignores. */
const g = (guess: string, colors: string, is_correct = false): EventRow => ({
  user_id: 'u1',
  id: 1,
  guess,
  colors,
  is_correct,
})

describe('wordle historySnapshot', () => {
  const guesses = [
    g('slate', 'xxgyx'),
    g('crane', 'yxxxg'),
    g('point', 'ggggg', true),
  ]

  it('includes the guess rows up to and including the viewed turn (inclusive)', () => {
    // Turn 0 → just the first row.
    expect(historySnapshot(guesses, 0).rows).toEqual([{ guess: 'slate', colors: 'xxgyx' }])
    // Turn 1 → the first two rows.
    expect(historySnapshot(guesses, 1).rows).toEqual([
      { guess: 'slate', colors: 'xxgyx' },
      { guess: 'crane', colors: 'yxxxg' },
    ])
  })

  it('rings the viewed turn — the last included row', () => {
    expect(historySnapshot(guesses, 0).historyLitBoardRow).toBe(0)
    expect(historySnapshot(guesses, 2).historyLitBoardRow).toBe(2)
  })

  it('describes the turn by its 1-based number + upper-cased guess', () => {
    expect(historySnapshot(guesses, 0).historyLabel).toBe('Guess 1: SLATE')
    expect(historySnapshot(guesses, 2).historyLabel).toBe('Guess 3: POINT')
  })

  it('is defensive about an out-of-range index (no crash, empty label)', () => {
    const snap = historySnapshot(guesses, 9)
    expect(snap.rows).toHaveLength(3) // slice clamps to what exists
    expect(snap.historyLabel).toBe('Guess 10')
  })
})
