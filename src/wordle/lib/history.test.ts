// cs-blessed-wordle

import { describe, it, expect } from 'vitest'
import { replayTurn } from './history'
import type { EventRow } from '../hooks/useGame'

/** A guess row, defaulting the fields the replay ignores. */
const g = (word: string, colors: string, is_correct = false): EventRow => ({
  user_id: 'u1',
  id: 1,
  word,
  colors,
  is_correct,
})

describe('wordle replayTurn', () => {
  // Ids deliberately not 0,1,2: a builder that still indexed would pass these
  // by accident.
  const guesses = [
    { ...g('slate', 'xxgyx'), id: 11 },
    { ...g('crane', 'yxxxg'), id: 12 },
    { ...g('point', 'ggggg', true), id: 13 },
  ]

  it('includes the guess rows up to and including the viewed turn (inclusive)', () => {
    // The first row → just it.
    expect(replayTurn(guesses, 11, 1, false).rows).toEqual([{ guess: 'slate', colors: 'xxgyx' }])
    // The second → the first two rows.
    expect(replayTurn(guesses, 12, 2, false).rows).toEqual([
      { guess: 'slate', colors: 'xxgyx' },
      { guess: 'crane', colors: 'yxxxg' },
    ])
  })

  it('rings the viewed turn — the last included row', () => {
    expect(replayTurn(guesses, 11, 1, false).litBoardRow).toBe(0)
    expect(replayTurn(guesses, 13, 3, false).litBoardRow).toBe(2)
  })

  it('describes the turn by the number it was GIVEN + the upper-cased guess', () => {
    expect(replayTurn(guesses, 11, 1, false).label).toBe('Guess 1: SLATE')
    expect(replayTurn(guesses, 13, 3, false).label).toBe('Guess 3: POINT')
    // The number is the LOG's, not this list's: a filtered log printed row 13
    // as "#2", and the banner echoes what the reader clicked.
    expect(replayTurn(guesses, 13, 2, false).label).toBe('Guess 2: POINT')
    // No number at all when the opening carried none.
    expect(replayTurn(guesses, 13, null, false).label).toBe('POINT')
  })

  it('an id not in the log replays nothing', () => {
    const replayed = replayTurn(guesses, 99, 1, false)
    expect(replayed.rows).toHaveLength(0)
    expect(replayed.litBoardRow).toBe(-1)
    expect(replayed.label).toBe('This guess')
    expect(replayed.authorId).toBeNull()
  })

  // Once a compete game has ended every player's rows arrive, interleaved.
  const table = [
    { ...g('slate', 'xxgyx'), id: 21, user_id: 'u1' },
    { ...g('crane', 'yxxxg'), id: 22, user_id: 'u2' },
    { ...g('point', 'ggggg', true), id: 23, user_id: 'u1' },
  ]

  it('in compete, replays only the author\'s own rows, and says whose they are', () => {
    const replayed = replayTurn(table, 23, 2, true)
    expect(replayed.rows.map((r) => r.guess)).toEqual(['slate', 'point'])
    expect(replayed.litBoardRow).toBe(1)
    expect(replayed.authorId).toBe('u1')
    expect(replayTurn(table, 22, 1, true).rows.map((r) => r.guess)).toEqual(['crane'])
  })

  it('in coop, replays the one shared board, every author\'s rows', () => {
    expect(replayTurn(table, 23, 3, false).rows.map((r) => r.guess)).toEqual(['slate', 'crane', 'point'])
  })
})
