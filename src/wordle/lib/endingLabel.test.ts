// cs-unmet

import { describe, expect, it } from 'vitest'
import type { GameEndedReason } from '@/common/ending/gameEnding'
import { findFewestGuessesAhead, makeEndingLabel } from './endingLabel'

/**
 * wordle's ending label for every ending it reaches, in both modes: the common
 * word, wordle's detail after it — what ran out, what lost a place — my
 * outcome, and which ending it is. A table, so a reader sees at a glance that
 * no row pairs a winning word with a losing outcome.
 */

type Player = Parameters<typeof makeEndingLabel>[0]
type Game = Parameters<typeof makeEndingLabel>[1]

/** A player out of play on 4 guesses, unless a case says otherwise. */
const player = (over: Partial<Player> = {}): Player => ({
  outcome: 'lost',
  conceded: false,
  finalRanking: null,
  solved: false,
  stillPlaying: false,
  ending: null,
  nGuessesUsed: 4,
  ...over,
})

/** A racer who spent their guesses. */
const outOfGuesses = (over: Partial<Player> = {}) =>
  player({ ending: { at: '2026-10-07T00:00:00Z', reason: 'resource_exhausted', detail: 'exhausted' }, ...over })

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

  // [case, player, game, fewest guesses ahead, word, long, pill, outcome, endedBy]
  const cases: [string, Player, Game, number | null, string, string, string, string, string][] = [
    ['coop: solved', player({ outcome: 'won', finalRanking: 1 }), gameEnded('coop', 'reached_goal'), null,
      'Won', 'solved it', 'solved it', 'won', 'game'],
    ['coop: out of guesses', player(), gameEnded('coop', 'resource_exhausted'), null,
      'Lost', 'out of guesses', 'out of guesses', 'lost', 'game'],
    ['coop: out of time', player(), gameEnded('coop', 'timeout'), null,
      'Lost', 'out of time', 'out of time', 'lost', 'game'],
    ['coop: a Stop', player({ outcome: 'neutral' }), gameEnded('coop', 'stopped'), null,
      'Stopped', '', '', 'neutral', 'game'],
    ['compete: I won', player({ outcome: 'won', finalRanking: 1, solved: true }), gameEnded('compete', 'reached_goal'), null,
      'Won', '', '', 'won', 'game'],
    ['compete: 2nd, on more guesses', player({ outcome: 'near', finalRanking: 2, solved: true }), gameEnded('compete', 'reached_goal'), 3,
      '2nd', 'more guesses', 'more guesses', 'near', 'game'],
    ['compete: 2nd, as many guesses, solved later', player({ outcome: 'near', finalRanking: 2, solved: true }), gameEnded('compete', 'reached_goal'), 4,
      '2nd', 'solved later', 'solved later', 'near', 'game'],
    ['compete: I solved, the others play on', player({ outcome: 'neutral', solved: true }), racePlaying, null,
      'Solved', 'waiting on the rest', 'waiting on the rest', 'neutral', 'player'],
    ['compete: out of guesses, the others play on', outOfGuesses(), racePlaying, null,
      'Lost', 'out of guesses', 'out of guesses', 'lost', 'player'],
    ['compete: out of guesses, then someone won', outOfGuesses(), gameEnded('compete', 'reached_goal'), null,
      'Lost', 'out of guesses', 'out of guesses', 'lost', 'game'],
    ['compete: out of time, never solved', player(), gameEnded('compete', 'timeout'), null,
      'Lost', 'out of time', 'out of time', 'lost', 'game'],
    ['compete: a Stop', player({ outcome: 'neutral' }), gameEnded('compete', 'stopped'), null,
      'Stopped', '', 'no winner', 'neutral', 'game'],
    ['compete: I conceded, the game goes on', conceded(), racePlaying, null,
      'Conceded', 'game continues', 'game continues', 'lost', 'player'],
    ['compete: I conceded, the game has ended', conceded(), gameEnded('compete', 'conceded'), null,
      'Conceded', '', '', 'lost', 'game'],
  ]

  it.each(cases)('%s', (_case, p, game, fewestGuessesAhead, word, long, pill, outcome, endedBy) => {
    expect(makeEndingLabel(p, game, fewestGuessesAhead)).toMatchObject({ word, long, pill, outcome, endedBy })
  })
})

describe('findFewestGuessesAhead', () => {
  const players = [
    { finalRanking: 1, nGuessesUsed: 3 },
    { finalRanking: 2, nGuessesUsed: 4 },
    { finalRanking: 3, nGuessesUsed: 4 },
    { finalRanking: null, nGuessesUsed: 2 },
  ]

  it('is the fewest guesses among every player ranked above, not just the one above', () => {
    expect(findFewestGuessesAhead({ finalRanking: 3 }, players)).toBe(3)
  })

  it('is null for first place and for a player with no place', () => {
    expect(findFewestGuessesAhead({ finalRanking: 1 }, players)).toBeNull()
    expect(findFewestGuessesAhead({ finalRanking: null }, players)).toBeNull()
  })
})
