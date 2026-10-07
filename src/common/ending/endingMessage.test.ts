// cs-blessed-feedback

import { describe, expect, it } from 'vitest'
import { buildStoppedMessage } from './endingMessage'

describe('buildStoppedMessage', () => {
  it('is neutral, says the game was stopped, and that nobody won in compete', () => {
    expect(buildStoppedMessage('coop')).toEqual({
      pillText: 'Stopped',
      infoColText: 'Stopped',
      outcome: 'neutral',
    })
    expect(buildStoppedMessage('compete').pillText).toBe('Stopped — no winner')
  })
})
