// cs-met-feedback

import { describe, expect, it } from 'vitest'
import { gameEndedTerminalMessage } from './terminalMessage'

describe('gameEndedTerminalMessage', () => {
  it('is neutral, names no winner, and says so in compete', () => {
    expect(gameEndedTerminalMessage('coop')).toEqual({
      pillText: 'Game ended',
      infoColText: 'Game over',
      outcome: 'neutral',
    })
    expect(gameEndedTerminalMessage('compete').pillText).toBe('Game ended — no winner')
  })
})
