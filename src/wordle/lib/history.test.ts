// cs-blessed-wordle

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
  // Ids deliberately not 0,1,2: a builder that still indexed would pass these
  // by accident.
  const guesses = [
    { ...g('slate', 'xxgyx'), id: 11 },
    { ...g('crane', 'yxxxg'), id: 12 },
    { ...g('point', 'ggggg', true), id: 13 },
  ]

  it('includes the guess rows up to and including the viewed turn (inclusive)', () => {
    // The first row → just it.
    expect(historySnapshot(guesses, 11, 1).rows).toEqual([{ guess: 'slate', colors: 'xxgyx' }])
    // The second → the first two rows.
    expect(historySnapshot(guesses, 12, 2).rows).toEqual([
      { guess: 'slate', colors: 'xxgyx' },
      { guess: 'crane', colors: 'yxxxg' },
    ])
  })

  it('rings the viewed turn — the last included row', () => {
    expect(historySnapshot(guesses, 11, 1).historyLitBoardRow).toBe(0)
    expect(historySnapshot(guesses, 13, 3).historyLitBoardRow).toBe(2)
  })

  it('describes the turn by the number it was GIVEN + the upper-cased guess', () => {
    expect(historySnapshot(guesses, 11, 1).historyLabel).toBe('Guess 1: SLATE')
    expect(historySnapshot(guesses, 13, 3).historyLabel).toBe('Guess 3: POINT')
    // The number is the LOG's, not this list's: a filtered log printed row 13
    // as "#2", and the banner echoes what the reader clicked.
    expect(historySnapshot(guesses, 13, 2).historyLabel).toBe('Guess 2: POINT')
    // No number at all when the opening carried none.
    expect(historySnapshot(guesses, 13, null).historyLabel).toBe('POINT')
  })

  it('an id this board does not hold replays nothing', () => {
    // A compete opponent's guess, against your own board: there is nothing of
    // theirs here to show, so the board comes back empty rather than full.
    const snap = historySnapshot(guesses, 99, 1)
    expect(snap.rows).toHaveLength(0)
    expect(snap.historyLitBoardRow).toBe(-1)
    expect(snap.historyLabel).toBe('This guess')
  })
})
