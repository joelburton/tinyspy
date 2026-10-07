// cs-unmet

import { describe, expect, it } from 'vitest'
import type { GameEndedReason } from '@/common/ending/gameEnding'
import { makeEndingLabel } from './endingLabel'

/**
 * codenamesduet's ending label for every ending it reaches: the common word,
 * the loss's cause after it, the team's outcome. A table, so a reader sees at
 * a glance that no row pairs a winning word with a losing outcome.
 */

type Player = Parameters<typeof makeEndingLabel>[0]

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

const ended = (reason: GameEndedReason, detail: string) => ({ ended: true, reason, detail })

describe('makeEndingLabel', () => {
  it('has no label while the team plays', () => {
    expect(makeEndingLabel(player({ stillPlaying: true, outcome: null }), { ended: false, reason: null, detail: null }))
      .toBeNull()
  })

  // [case, player, game, word, long, outcome]
  const cases: [string, Player, ReturnType<typeof ended>, string, string, string][] = [
    ['all fifteen agents', player({ outcome: 'won', finalRanking: 1 }), ended('reached_goal', 'solved'), 'Won', '', 'won'],
    ['an assassin', player(), ended('fatal_move', 'assassin'), 'Lost', 'assassin', 'lost'],
    ['a bystander in sudden death', player(), ended('fatal_move', 'neutral'), 'Lost', 'out of turns', 'lost'],
    ['the timer', player(), ended('timeout', 'timeout'), 'Lost', 'out of time', 'lost'],
    ['a loss nobody wrote a cause for', player(), ended('fatal_move', 'something new'), 'Lost', '', 'lost'],
    ['a Stop', player({ outcome: 'neutral' }), ended('stopped', 'stopped'), 'Stopped', '', 'neutral'],
  ]

  it.each(cases)('%s', (_case, p, game, word, long, outcome) => {
    expect(makeEndingLabel(p, game)).toMatchObject({ word, long, pill: long, outcome, endedBy: 'game' })
  })
})
