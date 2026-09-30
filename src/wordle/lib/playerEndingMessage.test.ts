// cs-unmet

import { describe, expect, it } from 'vitest'
import { buildPlayerEndingMessage } from './playerEndingMessage'

describe('buildPlayerEndingMessage', () => {
  it('says I solved it and wait on the rest, in the pill and the info column', () => {
    expect(buildPlayerEndingMessage({ reason: 'reached_goal', outcome: 'neutral' })).toEqual({
      pillText: 'Solved — waiting on the rest',
      infoColText: 'Waiting for others',
      outcome: 'neutral',
    })
  })

  it('says I am out of guesses, in the pill and the info column', () => {
    expect(buildPlayerEndingMessage({ reason: 'resource_exhausted', outcome: 'lost' })).toEqual({
      pillText: 'Out of guesses — waiting',
      infoColText: 'Waiting for others',
      outcome: 'lost',
    })
  })

  it('says I conceded, in the pill and the info column', () => {
    expect(buildPlayerEndingMessage({ reason: 'conceded', outcome: 'lost' })).toEqual({
      pillText: 'Conceded — race continues',
      infoColText: 'You conceded',
      outcome: 'lost',
    })
  })

  it('throws for a reason wordle never ends a player by', () => {
    expect(() => buildPlayerEndingMessage({ reason: 'timeout', outcome: 'lost' })).toThrow(/BUG/)
  })

  it('reads the outcome it is given, not one of its own', () => {
    expect(
      buildPlayerEndingMessage({ reason: 'reached_goal', outcome: 'lost' }).outcome,
    ).toBe('lost')
  })
})
