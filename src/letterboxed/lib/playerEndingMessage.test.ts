// cs-unmet

import { describe, expect, it } from 'vitest'
import { buildPlayerEndingMessage } from './playerEndingMessage'

describe('letterboxed buildPlayerEndingMessage', () => {
  it('a conceder is told the race goes on, in the outcome the server wrote', () => {
    expect(buildPlayerEndingMessage({ reason: 'conceded', outcome: 'lost' })).toEqual({
      pillText: 'Conceded — race continues', infoColText: 'You conceded', outcome: 'lost',
    })
  })

  it('no other way to end alone exists here, so any other is a bug', () => {
    expect(() => buildPlayerEndingMessage({ reason: 'reached_goal', outcome: 'won' })).toThrow(/no words/)
  })
})
