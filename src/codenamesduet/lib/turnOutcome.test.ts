/**
 * Tests for turnOutcome — the per-turn outcome-bar verdict for the GameTurnLog.
 * Pure function over a turn's guesses; the precedence is the contract (the bar
 * color itself is a visual concern verified in the browser).
 */
import { describe, expect, it } from 'vitest'
import { turnOutcome } from './turnOutcome'
import type { GuessRow } from '../hooks/useBoard'

/** A guess with just the field turnOutcome reads; the rest is filler. */
const g = (result: GuessRow['result']): GuessRow => ({
  position: 0,
  word: 'WORD',
  guesser_seat: 'B',
  result,
  turn_number: 1,
  guessed_at: '2026-06-12T18:00:00Z',
})

describe('turnOutcome', () => {
  it('is neutral when the turn was passed (no guesses)', () => {
    expect(turnOutcome([])).toBe('neutral')
  })

  it('is a WIN when every guess hit an agent', () => {
    expect(turnOutcome([g('G'), g('G')])).toBe('won')
  })

  it('is NEAR when agents are mixed with a neutral', () => {
    expect(turnOutcome([g('G'), g('N')])).toBe('near')
  })

  it('is a LOSS when the turn made no progress (only neutrals)', () => {
    expect(turnOutcome([g('N')])).toBe('lost')
  })

  it('is a LOSS when the assassin was hit, even alongside agents', () => {
    expect(turnOutcome([g('G'), g('A')])).toBe('lost')
  })
})
