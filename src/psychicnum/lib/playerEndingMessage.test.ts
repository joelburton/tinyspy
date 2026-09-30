// cs-unmet

import { describe, expect, it } from 'vitest'
import { buildPlayerEndingMessage } from './playerEndingMessage'

describe('buildPlayerEndingMessage', () => {
  it('says I conceded, in the pill and the info column', () => {
    expect(buildPlayerEndingMessage({ reason: 'conceded', outcome: 'lost' })).toEqual({
      pillText: 'Conceded — race continues',
      infoColText: 'You conceded',
      outcome: 'lost',
    })
  })

  it('says I am out of guesses, in the pill and the info column', () => {
    expect(buildPlayerEndingMessage({ reason: 'resource_exhausted', outcome: 'lost' })).toEqual({
      pillText: 'Out of guesses — race continues',
      infoColText: 'Out of guesses',
      outcome: 'lost',
    })
  })

  it('throws for a reason psychicnum never ends a player by', () => {
    expect(() => buildPlayerEndingMessage({ reason: 'timeout', outcome: 'lost' })).toThrow(/BUG/)
  })

  it('reads the outcome it is given, not one of its own', () => {
    expect(
      buildPlayerEndingMessage({ reason: 'resource_exhausted', outcome: 'neutral' }).outcome,
    ).toBe('neutral')
  })
})
