// cs-unmet

import { describe, expect, it } from 'vitest'
import type { GameEndedReason } from '@/common/ending/gameEnding'
import { findScoresAhead, makeEndingLabel } from './endingLabel'

/**
 * wordiply's ending label for every ending it reaches, in both modes: the
 * common word or wordiply's own no-result word, wordiply's detail after it —
 * coop's length score, what lost a place — my outcome, and which ending it is.
 * A table, so a reader sees at a glance that no row pairs a winning word with
 * a losing outcome.
 */

type Player = Parameters<typeof makeEndingLabel>[0]
type Game = Parameters<typeof makeEndingLabel>[1]
type Ahead = Parameters<typeof makeEndingLabel>[2]

/** A player out of play on 64% and 20 letters, unless a case says otherwise. */
const player = (over: Partial<Player> = {}): Player => ({
  outcome: 'lost',
  conceded: false,
  finalRanking: null,
  solved: false,
  stillPlaying: false,
  ending: null,
  lengthScore: 64,
  nLetters: 20,
  ...over,
})

/** A racer who has played their five words. */
const finished = (over: Partial<Player> = {}) =>
  player({ outcome: 'neutral', ending: { at: '2026-10-07T00:00:00Z', reason: 'resource_exhausted', detail: 'complete' }, ...over })

const conceded = (over: Partial<Player> = {}) =>
  player({
    ending: { at: '2026-10-07T00:00:00Z', reason: 'conceded', detail: 'conceded' },
    conceded: true,
    ...over,
  })

const gameEnded = (mode: 'coop' | 'compete', reason: GameEndedReason): Game =>
  ({ mode, ended: true, reason })

const racePlaying: Game = { mode: 'compete', ended: false, reason: null }

describe('makeEndingLabel', () => {
  it('has no label while I still play', () => {
    expect(makeEndingLabel(player({ stillPlaying: true, outcome: null }), racePlaying, [])).toBeNull()
  })

  // [case, player, game, ahead, word, long, pill, outcome, endedBy]
  const cases: [string, Player, Game, Ahead, string, string, string, string, string][] = [
    ['coop: five words played', player({ outcome: 'neutral', lengthScore: 72 }), gameEnded('coop', 'resource_exhausted'), [],
      'Ended', '72%', '72%', 'neutral', 'game'],
    ['coop: five words played, a longest possible word', player({ outcome: 'neutral', lengthScore: 100 }), gameEnded('coop', 'resource_exhausted'), [],
      'Ended', '100%', '100%', 'neutral', 'game'],
    ['coop: out of time', player(), gameEnded('coop', 'timeout'), [],
      'Lost', 'out of time', 'out of time', 'lost', 'game'],
    ['coop: a Stop', player({ outcome: 'neutral' }), gameEnded('coop', 'stopped'), [],
      'Stopped', '', '', 'neutral', 'game'],
    ['compete: I won', player({ outcome: 'won', finalRanking: 1 }), gameEnded('compete', 'resource_exhausted'), [],
      'Won', '', '', 'won', 'game'],
    ['compete: 2nd, a shorter longest word', player({ outcome: 'near', finalRanking: 2 }), gameEnded('compete', 'resource_exhausted'),
      [{ lengthScore: 80, nLetters: 18 }],
      '2nd', 'shorter word', 'shorter word', 'near', 'game'],
    ['compete: 2nd, as long a word, fewer letters', player({ outcome: 'near', finalRanking: 2 }), gameEnded('compete', 'resource_exhausted'),
      [{ lengthScore: 64, nLetters: 23 }],
      '2nd', 'fewer letters', 'fewer letters', 'near', 'game'],
    ['compete: 2nd, level on both, finished later', player({ outcome: 'near', finalRanking: 2 }), gameEnded('compete', 'timeout'),
      [{ lengthScore: 64, nLetters: 20 }],
      '2nd', 'finished later', 'finished later', 'near', 'game'],
    ['compete: my five played, the others play on', finished(), racePlaying, [],
      'Finished', 'waiting on the rest', 'waiting on the rest', 'neutral', 'player'],
    ['compete: nothing scored', player({ lengthScore: 0, nLetters: 0 }), gameEnded('compete', 'timeout'), [],
      'Lost', 'no words found', 'no words found', 'lost', 'game'],
    ['compete: a Stop', player({ outcome: 'neutral' }), gameEnded('compete', 'stopped'), [],
      'Stopped', '', 'no winner', 'neutral', 'game'],
    ['compete: I conceded, the game goes on', conceded(), racePlaying, [],
      'Conceded', 'game continues', 'game continues', 'lost', 'player'],
    ['compete: I conceded, the game has ended', conceded(), gameEnded('compete', 'conceded'), [],
      'Conceded', '', '', 'lost', 'game'],
  ]

  it.each(cases)('%s', (_case, p, game, ahead, word, long, pill, outcome, endedBy) => {
    expect(makeEndingLabel(p, game, ahead)).toMatchObject({ word, long, pill, outcome, endedBy })
  })
})

describe('findScoresAhead', () => {
  const players = [
    { finalRanking: 1, lengthScore: 80, nLetters: 20 },
    { finalRanking: 2, lengthScore: 64, nLetters: 20 },
    { finalRanking: null, lengthScore: 0, nLetters: 0 },
  ]

  it('is the players ranked above, and nobody for first or for a player with no place', () => {
    expect(findScoresAhead({ finalRanking: 2 }, players)).toEqual([players[0]])
    expect(findScoresAhead({ finalRanking: 1 }, players)).toEqual([])
    expect(findScoresAhead({ finalRanking: null }, players)).toEqual([])
  })
})
