// cs-unmet

import { describe, it, expect } from 'vitest'
import { makeGameData } from '../hooks/useGame'
import { ZTest_guess, ZTest_makeGameDataRaw, type ZTest_GameDataFacts } from './gameData.fixture'
import { replayTurn } from './history'

const TWO = [
  { id: 'u1', username: 'me', color: 'red' },
  { id: 'u2', username: 'moth', color: 'blue' },
]

const STARTER = { word: 'sieve', colors: 'yxyyg' }

/** The log as `gd` holds it, by player, for these facts. */
const eventsOf = (facts: ZTest_GameDataFacts) => makeGameData(ZTest_makeGameDataRaw(facts), 'u1').events

describe('wordleone replayTurn', () => {
  // Ids deliberately not 0,1,2: a builder that still indexed would pass these
  // by accident.
  const guesses = eventsOf({
    events: [
      ZTest_guess(11, 'u1', 'slate'),
      ZTest_guess(12, 'u1', 'crane'),
      ZTest_guess(13, 'u1', 'verse', true),
    ],
  })

  it('a miss shows the starter and its word below, as it looked before it was sent: uncolored, unringed', () => {
    const replayed = replayTurn(STARTER, guesses, 12, 2)
    expect(replayed.rows).toEqual([STARTER, { word: 'crane', colors: null }])
    expect(replayed.litRowIdx).toBe(-1)
  })

  it('the solve shows the starter and the green row, ringed', () => {
    const replayed = replayTurn(STARTER, guesses, 13, 3)
    expect(replayed.rows).toEqual([STARTER, { word: 'verse', colors: 'ggggg' }])
    expect(replayed.litRowIdx).toBe(1)
  })

  it('describes the turn by the number it was GIVEN + the upper-cased guess', () => {
    expect(replayTurn(STARTER, guesses, 11, 1).label).toBe('Guess 1: SLATE')
    // The number is the LOG's, not this list's: a filtered log printed row 13
    // as "#2", and the banner echoes what the reader clicked.
    expect(replayTurn(STARTER, guesses, 13, 2).label).toBe('Guess 2: VERSE')
    // No number at all when the opening carried none.
    expect(replayTurn(STARTER, guesses, 13, null).label).toBe('VERSE')
  })

  it('an id not in the log shows the starter alone', () => {
    const replayed = replayTurn(STARTER, guesses, 99, 1)
    expect(replayed.rows).toEqual([STARTER])
    expect(replayed.litRowIdx).toBe(-1)
    expect(replayed.label).toBe('This guess')
    expect(replayed.author).toBeNull()
  })

  it('names the author, so a rival\'s turn in an ended race says whose it is', () => {
    const table = eventsOf({
      mode: 'compete',
      players: TWO,
      events: [ZTest_guess(21, 'u1', 'slate'), ZTest_guess(22, 'u2', 'crane')],
      ending: { reason: 'stopped', detail: 'stopped', by: 'u1' },
      outcome: 'neutral',
    })
    expect(replayTurn(STARTER, table, 22, 1).author?.id).toBe('u2')
  })
})
