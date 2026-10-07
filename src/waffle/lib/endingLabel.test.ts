// cs-unmet

import { describe, expect, it } from 'vitest'
import type { GameEndedReason } from '@/common/ending/gameEnding'
import { findFewestSwapsAhead, makeEndingLabel } from './endingLabel'

/**
 * waffle's ending label for every ending it reaches, in both modes: the common
 * word, waffle's detail after it — par, what ran out, what lost a place — my
 * outcome, and which ending it is. A table, so a reader sees at a glance that
 * no row pairs a winning word with a losing outcome.
 */

type Player = Parameters<typeof makeEndingLabel>[0]
type Game = Parameters<typeof makeEndingLabel>[1]

/** A player out of play on 9 swaps, unless a case says otherwise. */
const player = (over: Partial<Player> = {}): Player => ({
  outcome: 'lost',
  conceded: false,
  finalRanking: null,
  solved: false,
  stillPlaying: false,
  ending: null,
  nSwapsUsed: 9,
  ...over,
})

/** A racer who spent their swaps. */
const outOfSwaps = (over: Partial<Player> = {}) =>
  player({ ending: { at: '2026-10-07T00:00:00Z', reason: 'resource_exhausted', detail: 'exhausted' }, ...over })

const conceded = (over: Partial<Player> = {}) =>
  player({
    ending: { at: '2026-10-07T00:00:00Z', reason: 'conceded', detail: 'conceded' },
    conceded: true,
    ...over,
  })

/** A game that ended, on a deal with par 7. */
const gameEnded = (mode: 'coop' | 'compete', reason: GameEndedReason): Game =>
  ({ mode, ended: true, reason, parSwaps: 7 })

const racePlaying: Game = { mode: 'compete', ended: false, reason: null, parSwaps: 7 }

describe('makeEndingLabel', () => {
  it('has no label while I still play', () => {
    expect(makeEndingLabel(player({ stillPlaying: true, outcome: null }), racePlaying, null)).toBeNull()
  })

  // [case, player, game, fewest swaps ahead, word, long, pill, outcome, endedBy]
  const cases: [string, Player, Game, number | null, string, string, string, string, string][] = [
    ['coop: solved at par', player({ outcome: 'won', finalRanking: 1, nSwapsUsed: 7 }), gameEnded('coop', 'reached_goal'), null,
      'Won', 'par', 'par', 'won', 'game'],
    ['coop: solved over par', player({ outcome: 'won', finalRanking: 1 }), gameEnded('coop', 'reached_goal'), null,
      'Won', 'par +2', 'par +2', 'won', 'game'],
    ['coop: out of swaps', player(), gameEnded('coop', 'resource_exhausted'), null,
      'Lost', 'out of swaps', 'out of swaps', 'lost', 'game'],
    ['coop: out of time', player(), gameEnded('coop', 'timeout'), null,
      'Lost', 'out of time', 'out of time', 'lost', 'game'],
    ['coop: a Stop', player({ outcome: 'neutral' }), gameEnded('coop', 'stopped'), null,
      'Stopped', '', '', 'neutral', 'game'],
    ['compete: I won', player({ outcome: 'won', finalRanking: 1, solved: true }), gameEnded('compete', 'reached_goal'), null,
      'Won', '', '', 'won', 'game'],
    ['compete: 2nd, on more swaps', player({ outcome: 'near', finalRanking: 2, solved: true }), gameEnded('compete', 'reached_goal'), 8,
      '2nd', 'more swaps', 'more swaps', 'near', 'game'],
    ['compete: 2nd, as many swaps, solved later', player({ outcome: 'near', finalRanking: 2, solved: true }), gameEnded('compete', 'reached_goal'), 9,
      '2nd', 'solved later', 'solved later', 'near', 'game'],
    ['compete: I solved, the others play on', player({ outcome: 'neutral', solved: true }), racePlaying, null,
      'Solved', 'waiting on the rest', 'waiting on the rest', 'neutral', 'player'],
    ['compete: out of swaps, the others play on', outOfSwaps(), racePlaying, null,
      'Lost', 'out of swaps', 'out of swaps', 'lost', 'player'],
    ['compete: out of swaps, then someone won', outOfSwaps(), gameEnded('compete', 'reached_goal'), null,
      'Lost', 'out of swaps', 'out of swaps', 'lost', 'game'],
    ['compete: out of time, never solved', player(), gameEnded('compete', 'timeout'), null,
      'Lost', 'out of time', 'out of time', 'lost', 'game'],
    ['compete: a Stop', player({ outcome: 'neutral' }), gameEnded('compete', 'stopped'), null,
      'Stopped', '', 'no winner', 'neutral', 'game'],
    ['compete: I conceded, the game goes on', conceded(), racePlaying, null,
      'Conceded', 'game continues', 'game continues', 'lost', 'player'],
    ['compete: I conceded, the game has ended', conceded(), gameEnded('compete', 'conceded'), null,
      'Conceded', '', '', 'lost', 'game'],
  ]

  it.each(cases)('%s', (_case, p, game, fewestSwapsAhead, word, long, pill, outcome, endedBy) => {
    expect(makeEndingLabel(p, game, fewestSwapsAhead)).toMatchObject({ word, long, pill, outcome, endedBy })
  })
})

describe('findFewestSwapsAhead', () => {
  const players = [
    { finalRanking: 1, nSwapsUsed: 7 },
    { finalRanking: 2, nSwapsUsed: 8 },
    { finalRanking: 3, nSwapsUsed: 8 },
    { finalRanking: null, nSwapsUsed: 5 },
  ]

  it('is the fewest swaps among every player ranked above, not just the one above', () => {
    expect(findFewestSwapsAhead({ finalRanking: 3 }, players)).toBe(7)
  })

  it('is null for first place and for a player with no place', () => {
    expect(findFewestSwapsAhead({ finalRanking: 1 }, players)).toBeNull()
    expect(findFewestSwapsAhead({ finalRanking: null }, players)).toBeNull()
  })
})
