// cs-unmet

import { describe, expect, it } from 'vitest'
import { buildPlayerEndingMessage } from './playerEndingMessage'

/** What a racer who has ended is told while the others race on. */
describe('wordiply buildPlayerEndingMessage', () => {
  it('five words spent: waiting, in the neutral the ranking leaves', () => {
    expect(buildPlayerEndingMessage({ reason: 'resource_exhausted', outcome: 'neutral' })).toEqual({
      pillText: 'Out of guesses — waiting',
      infoColText: 'Waiting for others',
      outcome: 'neutral',
    })
  })

  it('a concession: the race continues without me', () => {
    expect(buildPlayerEndingMessage({ reason: 'conceded', outcome: 'lost' })).toEqual({
      pillText: 'Conceded — race continues',
      infoColText: 'You conceded',
      outcome: 'lost',
    })
  })
})
