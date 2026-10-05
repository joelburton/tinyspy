// cs-unmet

import { describe, expect, it } from 'vitest'
import { buildGameEndedMessageNeutral } from '@/common/terminal/terminalMessage'
import { buildGameEndingMessage } from './gameEndingMessage'

const MOTH = { username: 'moth', color: 'blue' }

/** The message for one ending, with moth the winner where someone won. */
function messageFor(
  mode: 'coop' | 'compete',
  outcome: 'won' | 'lost' | 'neutral',
  reason: 'reached_goal' | 'timeout' | 'conceded' | 'stopped',
  playerOutcome: 'won' | 'lost' | 'neutral',
) {
  return buildGameEndingMessage({
    mode,
    gameEnding: { outcome, reason },
    playerOutcome,
    winner: outcome === 'won' && mode === 'compete' ? MOTH : null,
  })
}

describe('stackdown buildGameEndingMessage', () => {
  it('coop: a clear wins, a timeout is the one loss, a Stop is the shared neutral', () => {
    expect(messageFor('coop', 'won', 'reached_goal', 'won')).toEqual({
      pillText: 'Won: stack cleared', infoColText: 'Cleared!', outcome: 'won',
    })
    expect(messageFor('coop', 'lost', 'timeout', 'lost')).toEqual({
      pillText: 'Lost: out of time', infoColText: 'Out of time', outcome: 'lost',
    })
    expect(messageFor('coop', 'neutral', 'stopped', 'neutral')).toEqual({
      ...buildGameEndedMessageNeutral('coop'), outcome: 'neutral',
    })
  })

  it('compete: the clearer is told they won; everyone else is told WHO beat them', () => {
    expect(messageFor('compete', 'won', 'reached_goal', 'won')).toEqual({
      pillText: 'Won: cleared it first', infoColText: 'You won!', outcome: 'won',
    })
    expect(messageFor('compete', 'won', 'reached_goal', 'lost')).toEqual({
      pillText: 'cleared it first', infoColText: 'moth won', outcome: 'lost', actor: MOTH,
    })
  })

  it('compete with no winner: the timer, or every racer conceding', () => {
    expect(messageFor('compete', 'lost', 'timeout', 'lost')).toEqual({
      pillText: 'Out of time — no winner', infoColText: 'Out of time', outcome: 'lost',
    })
    expect(messageFor('compete', 'lost', 'conceded', 'lost')).toEqual({
      pillText: 'Nobody cleared it', infoColText: 'No winner', outcome: 'lost',
    })
  })
})
