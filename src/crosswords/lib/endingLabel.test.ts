// cs-unmet

import { describe, expect, it } from 'vitest'
import type { GameEndedReason } from '@/common/ending/gameEnding'
import { makeEndingLabel } from './endingLabel'

/**
 * crosswords' ending label for every ending it reaches, in both modes: the
 * common word — "Solved" for coop's win — the detail after it, my outcome, and
 * which ending it is. A table, so a reader sees at a glance that no row pairs
 * a winning word with a losing outcome.
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
    expect(makeEndingLabel(player({ stillPlaying: true, outcome: null }), racePlaying)).toBeNull()
  })

  // [case, player, game, word, long, pill, outcome, endedBy]
  const cases: [string, Player, Game, string, string, string, string, string][] = [
    ['coop: the grid solved', player({ outcome: 'won', finalRanking: 1 }), gameEnded('coop', 'reached_goal'),
      'Solved', '', '', 'won', 'game'],
    ['coop: out of time', player(), gameEnded('coop', 'timeout'),
      'Lost', 'out of time', 'out of time', 'lost', 'game'],
    ['coop: a Stop', player({ outcome: 'neutral' }), gameEnded('coop', 'stopped'),
      'Stopped', '', '', 'neutral', 'game'],
    ['compete: I solved it first', player({ outcome: 'won', finalRanking: 1 }), gameEnded('compete', 'reached_goal'),
      'Won', '', '', 'won', 'game'],
    ['compete: someone else solved it first', player(), gameEnded('compete', 'reached_goal'),
      'Lost', '', '', 'lost', 'game'],
    ['compete: out of time, nobody solved it', player(), gameEnded('compete', 'timeout'),
      'Lost', 'out of time', 'out of time', 'lost', 'game'],
    ['compete: a Stop', player({ outcome: 'neutral' }), gameEnded('compete', 'stopped'),
      'Stopped', '', 'no winner', 'neutral', 'game'],
    ['compete: I conceded, the game goes on', conceded(), racePlaying,
      'Conceded', 'game continues', 'game continues', 'lost', 'player'],
    ['compete: I conceded, the game has ended', conceded(), gameEnded('compete', 'conceded'),
      'Conceded', '', '', 'lost', 'game'],
  ]

  it.each(cases)('%s', (_case, p, game, word, long, pill, outcome, endedBy) => {
    expect(makeEndingLabel(p, game)).toMatchObject({ word, long, pill, outcome, endedBy })
  })
})
