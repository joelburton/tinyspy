// cs-unmet

import { describe, expect, it } from 'vitest'
import { buildPlayerEndingMessage } from './playerEndingMessage'

describe('buildPlayerEndingMessage', () => {
  it('says I am out on mistakes, in the pill and the info column', () => {
    expect(buildPlayerEndingMessage({ reason: 'resource_exhausted', outcome: 'lost' })).toEqual({
      pillText: 'Lost — race continues',
      infoColText: 'You’re out',
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

  it('throws for a reason connections never ends a player by', () => {
    expect(() => buildPlayerEndingMessage({ reason: 'reached_goal', outcome: 'neutral' }))
      .toThrow(/BUG/)
  })

  it('reads the outcome it is given, not one of its own', () => {
    expect(
      buildPlayerEndingMessage({ reason: 'conceded', outcome: 'neutral' }).outcome,
    ).toBe('neutral')
  })
})
