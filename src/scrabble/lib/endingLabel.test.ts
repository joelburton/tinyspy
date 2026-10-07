// cs-unmet

import { describe, expect, it } from 'vitest'
import type { GameEndedReason } from '@/common/ending/gameEnding'
import { makeEndingLabel } from './endingLabel'

/**
 * scrabble's ending label for every ending it reaches, in both modes: the
 * common word or scrabble's own no-result word, scrabble's detail after it, a
 * tie named, my outcome, and which ending it is. The pill is always the word
 * alone. A table, so a reader sees at a glance that no row pairs a winning
 * word with a losing outcome.
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

  // [case, player, game, tied with, word, long, outcome, endedBy]
  const cases: [string, Player, Game, string[], string, string, string, string][] = [
    ['coop: every tile played', player({ outcome: 'won', finalRanking: 1 }), gameEnded('coop', 'resource_exhausted'), [],
      'Won', 'every tile played', 'won', 'game'],
    ['coop: the team is never a tie', player({ outcome: 'won', finalRanking: 1 }), gameEnded('coop', 'resource_exhausted'), ['bea'],
      'Won', 'every tile played', 'won', 'game'],
    ['coop: out of time, tiles left over', player({ outcome: 'neutral' }), gameEnded('coop', 'timeout'), [],
      'Ended', 'out of time', 'neutral', 'game'],
    ['coop: a Stop', player({ outcome: 'neutral' }), gameEnded('coop', 'stopped'), [],
      'Stopped', '', 'neutral', 'game'],
    ['compete: the highest score', player({ outcome: 'won', finalRanking: 1 }), gameEnded('compete', 'resource_exhausted'), [],
      'Won', '', 'won', 'game'],
    ['compete: tied for first', player({ outcome: 'won', finalRanking: 1 }), gameEnded('compete', 'all_passed'), ['bea'],
      'Won', 'tied with bea', 'won', 'game'],
    ['compete: 2nd', player({ outcome: 'near', finalRanking: 2 }), gameEnded('compete', 'timeout'), [],
      '2nd', '', 'near', 'game'],
    ['compete: tied for 2nd', player({ outcome: 'near', finalRanking: 2 }), gameEnded('compete', 'timeout'), ['bea', 'cade'],
      '2nd', 'tied with bea & cade', 'near', 'game'],
    ['compete: no words played', player({ outcome: 'lost' }), gameEnded('compete', 'timeout'), [],
      'Lost', 'no words played', 'lost', 'game'],
    ['compete: a Stop', player({ outcome: 'neutral' }), gameEnded('compete', 'stopped'), [],
      'Stopped', '', 'neutral', 'game'],
    ['compete: I conceded, the game goes on', conceded(), racePlaying, [],
      'Conceded', 'game continues', 'lost', 'player'],
    ['compete: I conceded, the game has ended', conceded(), gameEnded('compete', 'resource_exhausted'), [],
      'Conceded', '', 'lost', 'game'],
  ]

  it.each(cases)('%s', (_case, p, game, tiedWithNames, word, long, outcome, endedBy) => {
    expect(makeEndingLabel(p, game, tiedWithNames)).toMatchObject({ word, long, pill: '', outcome, endedBy })
  })
})
