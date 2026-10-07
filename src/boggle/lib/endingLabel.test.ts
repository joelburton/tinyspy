// cs-unmet

import { describe, expect, it } from 'vitest'
import type { GameEndedReason } from '@/common/ending/gameEnding'
import { makeEndingLabel } from './endingLabel'

/**
 * boggle's ending label for every ending it reaches, in both modes, with a
 * target and without: the common word, boggle's detail after it, my outcome,
 * and which ending it is. A table, so a reader sees at a glance that no row
 * pairs a winning word with a losing outcome.
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
    ending: { at: '2026-10-06T00:00:00Z', reason: 'conceded', detail: 'conceded' },
    conceded: true,
    ...over,
  })

const gameEnded = (
  mode: 'coop' | 'compete',
  reason: GameEndedReason,
  detail: string,
  winPercent: number | null,
): Game => ({ mode, ended: true, reason, detail, winPercent })

const racePlaying: Game = { mode: 'compete', ended: false, reason: null, detail: null, winPercent: 65 }

describe('makeEndingLabel', () => {
  it('has no label while I still play', () => {
    expect(makeEndingLabel(player({ stillPlaying: true, outcome: null }), racePlaying)).toBeNull()
  })

  // [case, player, game, word, long, pill, outcome, endedBy]
  const cases: [string, Player, Game, string, string, string, string, string][] = [
    ['coop: the target reached', player({ outcome: 'won' }), gameEnded('coop', 'reached_goal', 'target', 65),
      'Won', 'reached 65%', 'reached 65%', 'won', 'game'],
    ['coop: every required word, no target', player({ outcome: 'won' }), gameEnded('coop', 'reached_goal', 'solved', null),
      'Won', '', '', 'won', 'game'],
    ['coop: out of time, a target set', player({ outcome: 'lost' }), gameEnded('coop', 'timeout', 'timeout', 65),
      'Lost', 'out of time', 'out of time', 'lost', 'game'],
    ['coop: out of time, no target', player({ outcome: 'neutral' }), gameEnded('coop', 'timeout', 'timeout', null),
      'Ended', 'out of time', 'out of time', 'neutral', 'game'],
    ['coop: a Stop', player({ outcome: 'neutral' }), gameEnded('coop', 'stopped', 'stopped', 65),
      'Stopped', '', '', 'neutral', 'game'],
    ['compete: I reached the target first', player({ outcome: 'won', finalRanking: 1 }), gameEnded('compete', 'reached_goal', 'target', 65),
      'Won', 'reached 65%', 'reached 65%', 'won', 'game'],
    ['compete: beaten to the target', player({ outcome: 'lost' }), gameEnded('compete', 'reached_goal', 'target', 65),
      'Lost', '', '', 'lost', 'game'],
    ['compete: out of time, a target set', player({ outcome: 'lost' }), gameEnded('compete', 'timeout', 'timeout', 65),
      'Lost', 'out of time', 'out of time', 'lost', 'game'],
    ['compete: top score at the buzzer, no target', player({ outcome: 'won', finalRanking: 1 }), gameEnded('compete', 'timeout', 'timeout', null),
      'Won', '', '', 'won', 'game'],
    ['compete: 2nd at the buzzer, no target', player({ outcome: 'near', finalRanking: 2 }), gameEnded('compete', 'timeout', 'timeout', null),
      '2nd', '', '', 'near', 'game'],
    ['compete: no words at the buzzer, no target', player({ outcome: 'lost' }), gameEnded('compete', 'timeout', 'timeout', null),
      'Lost', 'no words found', 'no words found', 'lost', 'game'],
    ['compete: a Stop', player({ outcome: 'neutral' }), gameEnded('compete', 'stopped', 'stopped', 65),
      'Stopped', '', 'no winner', 'neutral', 'game'],
    ['compete: I conceded, the race goes on', conceded(), racePlaying,
      'Conceded', 'game continues', 'game continues', 'lost', 'player'],
    ['compete: I conceded, the race has ended', conceded(), gameEnded('compete', 'reached_goal', 'target', 65),
      'Conceded', '', '', 'lost', 'game'],
  ]

  it.each(cases)('%s', (_case, p, game, word, long, pill, outcome, endedBy) => {
    expect(makeEndingLabel(p, game)).toMatchObject({ word, long, pill, outcome, endedBy })
  })
})
