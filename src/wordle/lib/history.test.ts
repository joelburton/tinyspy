// cs-blessed-wordle

import { describe, it, expect } from 'vitest'
import { makeGameData } from '../hooks/useGame'
import { ZTest_guess, ZTest_makeGameDataRaw, type ZTest_GameDataFacts } from './gameData.fixture'
import { replayTurn } from './history'

const TWO = [
  { id: 'u1', username: 'me', color: 'red' },
  { id: 'u2', username: 'moth', color: 'blue' },
]

/** The log as `gd` holds it, by player, for these facts. */
const eventsOf = (facts: ZTest_GameDataFacts) => makeGameData(ZTest_makeGameDataRaw(facts), 'u1').events

describe('wordle replayTurn', () => {
  // Ids deliberately not 0,1,2: a builder that still indexed would pass these
  // by accident.
  const guesses = eventsOf({
    events: [
      ZTest_guess(11, 'u1', 'slate', 'xxgyx'),
      ZTest_guess(12, 'u1', 'crane', 'yxxxg'),
      ZTest_guess(13, 'u1', 'point', 'ggggg'),
    ],
  })

  it('includes the guess rows up to and including the viewed turn (inclusive)', () => {
    // The first row → just it.
    expect(replayTurn(guesses, 11, 1, false).rows).toEqual([{ word: 'slate', colors: 'xxgyx' }])
    // The second → the first two rows.
    expect(replayTurn(guesses, 12, 2, false).rows).toEqual([
      { word: 'slate', colors: 'xxgyx' },
      { word: 'crane', colors: 'yxxxg' },
    ])
  })

  it('rings the viewed turn — the last included row', () => {
    expect(replayTurn(guesses, 11, 1, false).litRowIdx).toBe(0)
    expect(replayTurn(guesses, 13, 3, false).litRowIdx).toBe(2)
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
    expect(replayed.litRowIdx).toBe(-1)
    expect(replayed.label).toBe('This guess')
    expect(replayed.author).toBeNull()
  })

  // Once a compete game has ended every player's rows arrive, interleaved.
  const raceEnded: ZTest_GameDataFacts = {
    players: TWO,
    events: [
      ZTest_guess(21, 'u1', 'slate', 'xxgyx'),
      ZTest_guess(22, 'u2', 'crane', 'yxxxg'),
      ZTest_guess(23, 'u1', 'point', 'ggggg'),
    ],
    ending: { reason: 'reached_goal', detail: 'solved', by: 'u1', winner: 'u1' },
    outcome: 'won',
  }

  it('in compete, replays only the author\'s own rows, and says whose they are', () => {
    const table = eventsOf({ ...raceEnded, mode: 'compete' })
    const replayed = replayTurn(table, 23, 2, true)
    expect(replayed.rows.map((r) => r.word)).toEqual(['slate', 'point'])
    expect(replayed.litRowIdx).toBe(1)
    expect(replayed.author?.id).toBe('u1')
    expect(replayTurn(table, 22, 1, true).rows.map((r) => r.word)).toEqual(['crane'])
  })

  it('in coop, replays the one shared board, every author\'s rows', () => {
    const table = eventsOf(raceEnded)
    expect(replayTurn(table, 23, 3, false).rows.map((r) => r.word))
      .toEqual(['slate', 'crane', 'point'])
  })
})
