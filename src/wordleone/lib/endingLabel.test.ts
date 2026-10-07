// cs-unmet

import { describe, expect, it } from 'vitest'
import type { GameEndedReason } from '@/common/ending/gameEnding'
import { findFewestMissesAhead, makeEndingLabel } from './endingLabel'

/**
 * wordleone's ending label for every ending it reaches, in both modes: the
 * common word, wordleone's detail after it — what lost a place, the timer — my
 * outcome, and which ending it is. Nothing runs out, so no label says so.
 */

type Player = Parameters<typeof makeEndingLabel>[0]
type Game = Parameters<typeof makeEndingLabel>[1]

/** A player out of play on 2 misses, unless a case says otherwise. */
const player = (over: Partial<Player> = {}): Player => ({
  outcome: 'lost',
  conceded: false,
  finalRanking: null,
  solved: false,
  stillPlaying: false,
  ending: null,
  nMisses: 2,
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

  // [case, player, game, fewest misses ahead, word, long, pill, outcome, endedBy]
  const cases: [string, Player, Game, number | null, string, string, string, string, string][] = [
    ['coop: solved', player({ outcome: 'won', finalRanking: 1 }), gameEnded('coop', 'reached_goal'), null,
      'Won', 'solved it', 'solved it', 'won', 'game'],
    ['coop: out of time', player(), gameEnded('coop', 'timeout'), null,
      'Lost', 'out of time', 'out of time', 'lost', 'game'],
    ['coop: a Stop', player({ outcome: 'neutral' }), gameEnded('coop', 'stopped'), null,
      'Stopped', '', '', 'neutral', 'game'],
    ['compete: I won', player({ outcome: 'won', finalRanking: 1, solved: true }), gameEnded('compete', 'reached_goal'), null,
      'Won', '', '', 'won', 'game'],
    ['compete: 2nd, on more misses', player({ outcome: 'near', finalRanking: 2, solved: true }), gameEnded('compete', 'reached_goal'), 1,
      '2nd', 'more misses', 'more misses', 'near', 'game'],
    ['compete: 2nd, as many misses, solved later', player({ outcome: 'near', finalRanking: 2, solved: true }), gameEnded('compete', 'reached_goal'), 2,
      '2nd', 'solved later', 'solved later', 'near', 'game'],
    ['compete: I solved, the others play on', player({ outcome: 'neutral', solved: true }), racePlaying, null,
      'Solved', 'waiting on the rest', 'waiting on the rest', 'neutral', 'player'],
    ['compete: out of time, never solved', player(), gameEnded('compete', 'timeout'), null,
      'Lost', 'out of time', 'out of time', 'lost', 'game'],
    ['compete: unsolved, someone else won', player(), gameEnded('compete', 'reached_goal'), null,
      'Lost', '', '', 'lost', 'game'],
    ['compete: a Stop', player({ outcome: 'neutral' }), gameEnded('compete', 'stopped'), null,
      'Stopped', '', 'no winner', 'neutral', 'game'],
    ['compete: I conceded, the game goes on', conceded(), racePlaying, null,
      'Conceded', 'game continues', 'game continues', 'lost', 'player'],
    ['compete: I conceded, the game has ended', conceded(), gameEnded('compete', 'conceded'), null,
      'Conceded', '', '', 'lost', 'game'],
  ]

  it.each(cases)('%s', (_case, p, game, fewestMissesAhead, word, long, pill, outcome, endedBy) => {
    expect(makeEndingLabel(p, game, fewestMissesAhead)).toMatchObject({ word, long, pill, outcome, endedBy })
  })
})

describe('findFewestMissesAhead', () => {
  const players = [
    { finalRanking: 1, nMisses: 0 },
    { finalRanking: 2, nMisses: 2 },
    { finalRanking: 3, nMisses: 2 },
    { finalRanking: null, nMisses: 5 },
  ]

  it('is the fewest misses among every player ranked above, not just the one above', () => {
    expect(findFewestMissesAhead({ finalRanking: 3 }, players)).toBe(0)
  })

  it('is null for first place and for a player with no place', () => {
    expect(findFewestMissesAhead({ finalRanking: 1 }, players)).toBeNull()
    expect(findFewestMissesAhead({ finalRanking: null }, players)).toBeNull()
  })
})
