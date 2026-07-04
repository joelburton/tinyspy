import { describe, it, expect } from 'vitest'
import { turnSnapshot } from './history'
import type { GuessRow } from '../hooks/useGame'

/** A guess row, defaulting the fields the snapshot ignores. */
const g = (guess: string, colors: string, is_correct = false): GuessRow => ({
  user_id: 'u1',
  guess_index: 0,
  guess,
  colors,
  is_correct,
})

describe('wordle turnSnapshot', () => {
  const guesses = [
    g('slate', 'xxgyx'),
    g('crane', 'yxxxg'),
    g('point', 'ggggg', true),
  ]

  it('includes the guess rows up to and including the viewed turn (inclusive)', () => {
    // Turn 0 → just the first row.
    expect(turnSnapshot(guesses, 0).rows).toEqual([{ guess: 'slate', colors: 'xxgyx' }])
    // Turn 1 → the first two rows.
    expect(turnSnapshot(guesses, 1).rows).toEqual([
      { guess: 'slate', colors: 'xxgyx' },
      { guess: 'crane', colors: 'yxxxg' },
    ])
  })

  it('rings the viewed turn — the last included row', () => {
    expect(turnSnapshot(guesses, 0).highlightRow).toBe(0)
    expect(turnSnapshot(guesses, 2).highlightRow).toBe(2)
  })

  it('describes the turn by its 1-based number + upper-cased guess', () => {
    expect(turnSnapshot(guesses, 0).description).toBe('Guess 1: SLATE')
    expect(turnSnapshot(guesses, 2).description).toBe('Guess 3: POINT')
  })

  it('is defensive about an out-of-range index (no crash, empty label)', () => {
    const snap = turnSnapshot(guesses, 9)
    expect(snap.rows).toHaveLength(3) // slice clamps to what exists
    expect(snap.description).toBe('Guess 10')
  })
})
