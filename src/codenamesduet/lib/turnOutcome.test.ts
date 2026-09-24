// cs-blessed-codenamesduet

/**
 * Tests for turnOutcome — the per-turn outcome-bar verdict for the GameEventLog.
 * Pure function over a turn's guesses; the precedence is the contract (the bar
 * color itself is a visual concern verified in the browser).
 */
import { describe, expect, it } from 'vitest'
import { turnOutcome } from './turnOutcome'
import type { GuessEvent } from './events'

/** A guess with just the field turnOutcome reads; the rest is filler. */
const g = (guess_result: GuessEvent['guess_result']): GuessEvent => ({
  kind: 'guess',
  id: 1,
  user_id: 'bea',
  took_turn: false,
  created_at: '2026-06-12T18:00:00Z',
  turn_number: 1,
  seat: 'B',
  guess_position: 0,
  guess_result,
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

describe('turnOutcome — sudden death', () => {
  const sd = { suddenDeath: true }

  it('is a WIN while every guess is an agent', () => {
    expect(turnOutcome([g('G'), g('G')], sd)).toBe('won')
  })

  it('is a LOSS on any non-agent — where an ordinary turn would read near', () => {
    expect(turnOutcome([g('G'), g('N')], sd)).toBe('lost')
    expect(turnOutcome([g('N')], sd)).toBe('lost')
    expect(turnOutcome([g('A')], sd)).toBe('lost')
  })

  it('is neutral before its first guess', () => {
    expect(turnOutcome([], sd)).toBe('neutral')
  })
})
