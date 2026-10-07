// cs-unmet

import { describe, expect, it } from 'vitest'
import type { GameEndedReason } from '@/common/ending/gameEnding'
import { findFewestHintsAhead, makeEndingLabel } from './endingLabel'

/**
 * strands' ending label for every ending it reaches, in both modes: the common
 * word, strands' detail after it, my outcome, and which ending it is — and the
 * place below first, told "more hints" from "solved later". A table, so a
 * reader sees at a glance that no row pairs a winning word with a losing
 * outcome.
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
  nHintsUsed: 2,
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
    expect(makeEndingLabel(player({ stillPlaying: true, outcome: null }), racePlaying, null)).toBeNull()
  })

  // [case, player, game, fewest hints ahead, word, long, pill, outcome, endedBy]
  const cases: [string, Player, Game, number | null, string, string, string, string, string][] = [
    ['coop: every word found', player({ outcome: 'won', finalRanking: 1 }), gameEnded('coop', 'reached_goal'), null,
      'Won', 'every word found', 'every word found', 'won', 'game'],
    ['coop: out of time', player({ outcome: 'lost' }), gameEnded('coop', 'timeout'), null,
      'Lost', 'out of time', 'out of time', 'lost', 'game'],
    ['coop: a Stop', player({ outcome: 'neutral' }), gameEnded('coop', 'stopped'), null,
      'Stopped', '', '', 'neutral', 'game'],
    ['compete: I won', player({ outcome: 'won', finalRanking: 1, solved: true }), gameEnded('compete', 'reached_goal'), null,
      'Won', '', '', 'won', 'game'],
    ['compete: 2nd, on more hints', player({ outcome: 'near', finalRanking: 2, solved: true }), gameEnded('compete', 'reached_goal'), 0,
      '2nd', 'more hints', 'more hints', 'near', 'game'],
    ['compete: 2nd, as many hints, solved later', player({ outcome: 'near', finalRanking: 2, solved: true }), gameEnded('compete', 'reached_goal'), 2,
      '2nd', 'solved later', 'solved later', 'near', 'game'],
    ['compete: never solved', player({ outcome: 'lost' }), gameEnded('compete', 'timeout'), null,
      'Lost', '', '', 'lost', 'game'],
    ['compete: I solved, the others play on', player({ outcome: 'neutral', solved: true }), racePlaying, null,
      'Solved', 'waiting on the rest', 'waiting on the rest', 'neutral', 'player'],
    ['compete: a Stop', player({ outcome: 'neutral' }), gameEnded('compete', 'stopped'), null,
      'Stopped', '', 'no winner', 'neutral', 'game'],
    ['compete: I conceded, the game goes on', conceded(), racePlaying, null,
      'Conceded', 'game continues', 'game continues', 'lost', 'player'],
    ['compete: I conceded, the game has ended', conceded(), gameEnded('compete', 'reached_goal'), null,
      'Conceded', '', '', 'lost', 'game'],
  ]

  it.each(cases)('%s', (_case, p, game, fewestHintsAhead, word, long, pill, outcome, endedBy) => {
    expect(makeEndingLabel(p, game, fewestHintsAhead)).toMatchObject({ word, long, pill, outcome, endedBy })
  })
})

describe('findFewestHintsAhead', () => {
  const players = [
    { finalRanking: 1, nHintsUsed: 0 },
    { finalRanking: 2, nHintsUsed: 1 },
    { finalRanking: 3, nHintsUsed: 1 },
    { finalRanking: null, nHintsUsed: 0 },
  ]

  it('is the fewest hints among every player ranked above, not just the one above', () => {
    expect(findFewestHintsAhead({ finalRanking: 3 }, players)).toBe(0)
  })

  it('is null for first place and for a player with no place', () => {
    expect(findFewestHintsAhead({ finalRanking: 1 }, players)).toBeNull()
    expect(findFewestHintsAhead({ finalRanking: null }, players)).toBeNull()
  })
})
