/**
 * Tests for turnOutcome — the per-turn outcome-bar verdict for the GameTurnLog.
 * Pure function over a turn's guesses; the precedence is the contract (the bar
 * color itself is a visual concern verified in the browser).
 */
import { describe, expect, it } from 'vitest'
import { turnOutcome } from './turnOutcome'
import type { GuessRow } from '../hooks/useBoard'

/** A guess with just the field turnOutcome reads; the rest is filler. */
const g = (outcome: GuessRow['outcome']): GuessRow => ({
  position: 0,
  word: 'WORD',
  guesser_seat: 'B',
  outcome,
  turn_number: 1,
  guessed_at: '2026-06-12T18:00:00Z',
})

describe('turnOutcome', () => {
  it('is neutral when the turn was passed (no guesses)', () => {
    expect(turnOutcome([])).toBe('neutral')
  })

  it('is good when every guess hit an agent', () => {
    expect(turnOutcome([g('G'), g('G')])).toBe('good')
  })

  it('is partial when agents are mixed with a neutral', () => {
    expect(turnOutcome([g('G'), g('N')])).toBe('partial')
  })

  it('is bad when the turn made no progress (only neutrals)', () => {
    expect(turnOutcome([g('N')])).toBe('bad')
  })

  it('is bad when the assassin was hit, even alongside agents', () => {
    expect(turnOutcome([g('G'), g('A')])).toBe('bad')
  })
})
