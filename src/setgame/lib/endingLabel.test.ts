// cs-unmet

import { describe, expect, it } from 'vitest'
import type { GameEndedReason } from '@/common/ending/gameEnding'
import { makeEndingLabel } from './endingLabel'

/**
 * setgame's ending label for every ending it reaches, in both modes: the
 * common word or setgame's own no-result word, setgame's detail after it, a
 * tie named, my outcome, and which ending it is. A table, so a reader sees at
 * a glance that no row pairs a winning word with a losing outcome.
 */

type Player = Parameters<typeof makeEndingLabel>[0]
type Game = Parameters<typeof makeEndingLabel>[1]

/** A player out of play, unless a case says otherwise. */
const player = (over: Partial<Player> = {}): Player => ({
  outcome: 'lost',
  conceded: false,
  finalRanking: null,
  solved: false,
  stillPlaying: false,
  ending: null,
  ...over,
})

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

  // [case, player, game, tied with, word, long, pill, outcome, endedBy]
  const cases: [string, Player, Game, string[], string, string, string, string, string][] = [
    ['coop: a perfect clear', player({ outcome: 'won', finalRanking: 1 }), gameEnded('coop', 'reached_goal'), [],
      'Won', 'perfect clear', 'perfect clear', 'won', 'game'],
    ['coop: the team is never a tie', player({ outcome: 'won', finalRanking: 1 }), gameEnded('coop', 'reached_goal'), ['bea'],
      'Won', 'perfect clear', 'perfect clear', 'won', 'game'],
    ['coop: the deck emptied, tiles left over', player({ outcome: 'neutral' }), gameEnded('coop', 'resource_exhausted'), [],
      'Ended', 'emptied deck', 'emptied deck', 'neutral', 'game'],
    ['coop: out of time', player({ outcome: 'lost' }), gameEnded('coop', 'timeout'), [],
      'Lost', 'out of time', 'out of time', 'lost', 'game'],
    ['coop: a Stop', player({ outcome: 'neutral' }), gameEnded('coop', 'stopped'), [],
      'Stopped', '', '', 'neutral', 'game'],
    ['compete: the most sets', player({ outcome: 'won', finalRanking: 1 }), gameEnded('compete', 'resource_exhausted'), [],
      'Won', '', '', 'won', 'game'],
    ['compete: tied for the most', player({ outcome: 'won', finalRanking: 1 }), gameEnded('compete', 'timeout'), ['bea'],
      'Won', 'tied with bea', 'tied with bea', 'won', 'game'],
    ['compete: tied three ways', player({ outcome: 'won', finalRanking: 1 }), gameEnded('compete', 'timeout'), ['bea', 'cade'],
      'Won', 'tied with bea & cade', 'tied with bea & cade', 'won', 'game'],
    ['compete: 2nd', player({ outcome: 'near', finalRanking: 2 }), gameEnded('compete', 'resource_exhausted'), [],
      '2nd', '', '', 'near', 'game'],
    ['compete: tied for 2nd', player({ outcome: 'near', finalRanking: 2 }), gameEnded('compete', 'resource_exhausted'), ['bea', 'cade', 'dee'],
      '2nd', 'tied with bea, cade & dee', 'tied with bea, cade & dee', 'near', 'game'],
    ['compete: no sets found', player({ outcome: 'lost' }), gameEnded('compete', 'resource_exhausted'), [],
      'Lost', 'no sets found', 'no sets found', 'lost', 'game'],
    ['compete: a Stop', player({ outcome: 'neutral' }), gameEnded('compete', 'stopped'), [],
      'Stopped', '', 'no winner', 'neutral', 'game'],
    ['compete: I conceded, the game goes on', conceded(), racePlaying, [],
      'Conceded', 'game continues', 'game continues', 'lost', 'player'],
    ['compete: I conceded, the game has ended', conceded(), gameEnded('compete', 'resource_exhausted'), [],
      'Conceded', '', '', 'lost', 'game'],
    ['compete: everyone conceded', conceded(), gameEnded('compete', 'conceded'), [],
      'Conceded', '', '', 'lost', 'game'],
  ]

  it.each(cases)('%s', (_case, p, game, tiedWithNames, word, long, pill, outcome, endedBy) => {
    expect(makeEndingLabel(p, game, tiedWithNames)).toMatchObject({ word, long, pill, outcome, endedBy })
  })
})
