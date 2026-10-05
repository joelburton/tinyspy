// cs-blessed-codenamesduet

/**
 * `lib/events.ts` — the two views of the log the surface reads: `cluesOf` and
 * `guessesOf` keep the log's order, and a guess gets the word on its tile.
 */
import { describe, expect, it } from 'vitest'
import { makeGameData } from '../hooks/useGame'
import { ZTest_clue, ZTest_guess, ZTest_makeGameDataRaw } from './gameData.fixture'
import { cluesOf, guessesOf } from './events'

const gd = makeGameData(
  ZTest_makeGameDataRaw({
    events: [
      ZTest_clue(1, 'u1', 1, 'TOOLS', 2),
      { ...ZTest_clue(2, 'u1', 1, 'x', 0), kind: 'hint', clueWord: null, clueCount: null, clueFromAi: null },
      ZTest_guess(3, 'u2', 1, 4, 'G'),
      ZTest_guess(4, 'u2', 1, 9, 'N'),
    ],
  }),
  'u1',
)

describe('cluesOf / guessesOf', () => {
  it('picks the clues out, in order', () => {
    expect(cluesOf(gd.events).map((c) => [c.id, c.clueWord])).toEqual([[1, 'TOOLS']])
  })

  it('picks the guesses out, in order, each with the word on its tile', () => {
    expect(guessesOf(gd.events, gd.puzzle.tilesById).map((g) => [g.id, g.word])).toEqual([
      [3, 'word4'],
      [4, 'word9'],
    ])
  })
})
