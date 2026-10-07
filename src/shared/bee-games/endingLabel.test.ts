// cs-unmet

import { describe, expect, it } from 'vitest'
import type { GameEndedReason } from '@/common/ending/gameEnding'
import { makeBeeEndingLabel } from './endingLabel'

/**
 * The bee games' ending label for every ending they reach, in both modes,
 * with a target rank and without: the common word, the detail after it, my
 * outcome, and which ending it is. A table, so a reader sees at a glance that
 * no row pairs a winning word with a losing outcome.
 */

type Player = Parameters<typeof makeBeeEndingLabel>[0]
type Game = Parameters<typeof makeBeeEndingLabel>[1]

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

// Genius is RANKS[6].
const gameEnded = (
  mode: 'coop' | 'compete',
  reason: GameEndedReason,
  detail: string,
  targetRankIdx: number | null,
): Game => ({ mode, ended: true, reason, detail, targetRankIdx })

const racePlaying: Game = { mode: 'compete', ended: false, reason: null, detail: null, targetRankIdx: 6 }

describe('makeBeeEndingLabel', () => {
  it('has no label while I still play', () => {
    expect(makeBeeEndingLabel(player({ stillPlaying: true, outcome: null }), racePlaying)).toBeNull()
  })

  // [case, player, game, word, long, pill, outcome, endedBy]
  const cases: [string, Player, Game, string, string, string, string, string][] = [
    ['coop: the target reached', player({ outcome: 'won' }), gameEnded('coop', 'reached_goal', 'target', 6),
      'Won', 'reached Genius', 'reached Genius', 'won', 'game'],
    ['coop: every required word, no target', player({ outcome: 'won' }), gameEnded('coop', 'reached_goal', 'solved', null),
      'Won', '', '', 'won', 'game'],
    ['coop: out of time, a target set', player({ outcome: 'lost' }), gameEnded('coop', 'timeout', 'timeout', 6),
      'Lost', 'out of time', 'out of time', 'lost', 'game'],
    ['coop: out of time, no target', player({ outcome: 'neutral' }), gameEnded('coop', 'timeout', 'timeout', null),
      'Ended', 'out of time', 'out of time', 'neutral', 'game'],
    ['coop: a Stop', player({ outcome: 'neutral' }), gameEnded('coop', 'stopped', 'stopped', 6),
      'Stopped', '', '', 'neutral', 'game'],
    ['compete: I reached the target first', player({ outcome: 'won', finalRanking: 1 }), gameEnded('compete', 'reached_goal', 'target', 6),
      'Won', 'reached Genius', 'reached Genius', 'won', 'game'],
    ['compete: beaten to the target', player({ outcome: 'lost' }), gameEnded('compete', 'reached_goal', 'target', 6),
      'Lost', '', '', 'lost', 'game'],
    ['compete: out of time, a target set', player({ outcome: 'lost' }), gameEnded('compete', 'timeout', 'timeout', 6),
      'Lost', 'out of time', 'out of time', 'lost', 'game'],
    ['compete: top score at the countdown, no target', player({ outcome: 'won', finalRanking: 1 }), gameEnded('compete', 'timeout', 'timeout', null),
      'Won', '', '', 'won', 'game'],
    ['compete: 2nd at the countdown, no target', player({ outcome: 'near', finalRanking: 2 }), gameEnded('compete', 'timeout', 'timeout', null),
      '2nd', '', '', 'near', 'game'],
    ['compete: no words at the countdown, no target', player({ outcome: 'lost' }), gameEnded('compete', 'timeout', 'timeout', null),
      'Lost', 'no words found', 'no words found', 'lost', 'game'],
    ['compete: a Stop', player({ outcome: 'neutral' }), gameEnded('compete', 'stopped', 'stopped', 6),
      'Stopped', '', 'no winner', 'neutral', 'game'],
    ['compete: I conceded, the race goes on', conceded(), racePlaying,
      'Conceded', 'game continues', 'game continues', 'lost', 'player'],
    ['compete: I conceded, the race has ended', conceded(), gameEnded('compete', 'reached_goal', 'target', 6),
      'Conceded', '', '', 'lost', 'game'],
  ]

  it.each(cases)('%s', (_case, p, game, word, long, pill, outcome, endedBy) => {
    expect(makeBeeEndingLabel(p, game)).toMatchObject({ word, long, pill, outcome, endedBy })
  })
})
