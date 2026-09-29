// cs-blessed-feedback

import { describe, expect, it } from 'vitest'
import { buildGameEndedMessageNeutral } from './terminalMessage'

describe('buildGameEndedMessageNeutral', () => {
  it('is neutral, names no winner, and says so in compete', () => {
    expect(buildGameEndedMessageNeutral('coop')).toEqual({
      pillText: 'Game ended',
      infoColText: 'Game over',
      outcome: 'neutral',
    })
    expect(buildGameEndedMessageNeutral('compete').pillText).toBe('Game ended — no winner')
  })
})
