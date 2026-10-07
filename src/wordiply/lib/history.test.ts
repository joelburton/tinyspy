// cs-unmet

import { describe, expect, it } from 'vitest'
import { replayTurn } from './history'
import { makeGameData } from '../hooks/useGame'
import { ZTest_guess, ZTest_makeGameDataRaw } from './gameData.fixture'

const TWO = [
  { id: 'u1', username: 'me', color: 'red' },
  { id: 'u2', username: 'moth', color: 'blue' },
]

/** The log of a game, read through `gd`, so each row carries its player. */
function eventsOf(mode: 'coop' | 'compete', guesses: ReturnType<typeof ZTest_guess>[]) {
  const ended = { reason: 'stopped' as const, detail: 'stopped', by: 'u1' }
  return makeGameData(
    ZTest_makeGameDataRaw({ mode, players: TWO, events: guesses, ending: ended, outcome: 'neutral' }),
    'u1',
  ).events
}

// Two accepted words with a reject between them. The ids are what the viewer
// addresses, and are deliberately not 0, 1, 2.
const ROWS = eventsOf('coop', [
  ZTest_guess(11, 'u1', 'hangars'),
  ZTest_guess(12, 'u2', 'arqq', 'not_a_word'),
  ZTest_guess(13, 'u2', 'arcs'),
])

describe('wordiply replayTurn', () => {
  it('fills a line per ACCEPTED word up to and including the viewed row', () => {
    expect(replayTurn(ROWS, 11, false).words).toEqual(['hangars'])
    expect(replayTurn(ROWS, 13, false).words).toEqual(['hangars', 'arcs'])
  })

  it('a reject shows the board WITHOUT it — it occupies no line', () => {
    // The point of the viewer in this game: the board never says what was
    // tried, so a reject's row is the only place that moment exists.
    expect(replayTurn(ROWS, 12, false).words).toEqual(['hangars'])
  })

  it('names the row by what it turned out to be, and who wrote it', () => {
    expect(replayTurn(ROWS, 11, false).label).toBe('HANGARS — 7 letters')
    expect(replayTurn(ROWS, 12, false).label).toBe('ARQQ — not a word')
    expect(replayTurn(ROWS, 12, false).author?.id).toBe('u2')
    const rules = eventsOf('coop', [ZTest_guess(7, 'u1', 'ar', 'too_short'), ZTest_guess(8, 'u1', 'zzz', 'missing_base')])
    expect(replayTurn(rules, 7, false).label).toBe('AR — too short')
    expect(replayTurn(rules, 8, false).label).toBe('ZZZ — no starter word')
  })

  it('compete replays the author\'s own board', () => {
    const race = eventsOf('compete', [
      ZTest_guess(1, 'u1', 'cars'),
      ZTest_guess(2, 'u2', 'hangars'),
      ZTest_guess(3, 'u2', 'stars'),
    ])
    expect(replayTurn(race, 3, true).words).toEqual(['hangars', 'stars'])
    expect(replayTurn(race, 1, true).words).toEqual(['cars'])
  })

  it('an id the log does not hold replays nothing', () => {
    const turn = replayTurn(ROWS, 99, false)
    expect(turn.words).toEqual([])
    expect(turn.label).toBe('This guess')
    expect(turn.author).toBeNull()
  })
})
