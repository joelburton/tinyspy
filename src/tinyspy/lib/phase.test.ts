/**
 * Tests for `derivePhase` — the pure function that decides which UI
 * state BoardScreen is in given a game's status, the seats, and
 * whether a clue exists.
 *
 * The matrix of inputs is small enough (status × seat × clue presence)
 * that we can enumerate every interesting combination here, which is
 * easier to read and faster to run than rendering BoardScreen with
 * mocked hooks.
 */

import { describe, expect, it } from 'vitest'
import { derivePhase, type PhaseInputs } from './phase'

/** Reusable defaults so each test only states what it changes. */
function inputs(overrides: Partial<PhaseInputs> = {}): PhaseInputs {
  return {
    status: 'active',
    currentClueGiver: 'A',
    mySeat: 'A',
    hasCurrentTurnClue: false,
    ...overrides,
  }
}

describe('derivePhase — gameOver flag', () => {
  it('is true for any terminal status', () => {
    for (const status of ['won', 'lost_assassin', 'lost_clock'] as const) {
      expect(derivePhase(inputs({ status })).gameOver).toBe(true)
    }
  })

  it('is false during active play and sudden death', () => {
    expect(derivePhase(inputs({ status: 'active' })).gameOver).toBe(false)
    expect(derivePhase(inputs({ status: 'sudden_death' })).gameOver).toBe(false)
  })
})

describe('derivePhase — isClueGiver', () => {
  it('is true when mySeat matches the current clue-giver', () => {
    expect(derivePhase(inputs({ mySeat: 'A', currentClueGiver: 'A' })).isClueGiver).toBe(true)
  })

  it('is false when seats differ', () => {
    expect(derivePhase(inputs({ mySeat: 'B', currentClueGiver: 'A' })).isClueGiver).toBe(false)
  })

  it('is false when the current clue-giver is null (game over)', () => {
    expect(derivePhase(inputs({ mySeat: 'A', currentClueGiver: null })).isClueGiver).toBe(false)
  })

  it('is false when mySeat is undefined (caller is not seated)', () => {
    expect(derivePhase(inputs({ mySeat: undefined, currentClueGiver: 'A' })).isClueGiver).toBe(false)
  })
})

describe('derivePhase — isGuessPhase', () => {
  it('mirrors hasCurrentTurnClue', () => {
    expect(derivePhase(inputs({ hasCurrentTurnClue: true })).isGuessPhase).toBe(true)
    expect(derivePhase(inputs({ hasCurrentTurnClue: false })).isGuessPhase).toBe(false)
  })
})

describe('derivePhase — cellsClickable', () => {
  // The interesting matrix. The expected behavior:
  //   gameOver                              → never
  //   sudden_death (regardless of seat)     → always
  //   active + guess phase + not clue-giver → yes (the guesser's window)
  //   active + clue phase                   → no (no clue to guess against)
  //   active + guess phase + clue-giver     → no (you submitted the clue)

  it('is false when the game is over (any terminal status)', () => {
    for (const status of ['won', 'lost_assassin', 'lost_clock'] as const) {
      expect(derivePhase(inputs({ status, hasCurrentTurnClue: true })).cellsClickable).toBe(false)
    }
  })

  it('is true in sudden death for either seat', () => {
    expect(
      derivePhase(inputs({ status: 'sudden_death', mySeat: 'A', currentClueGiver: null })).cellsClickable,
    ).toBe(true)
    expect(
      derivePhase(inputs({ status: 'sudden_death', mySeat: 'B', currentClueGiver: null })).cellsClickable,
    ).toBe(true)
  })

  it('is true for the guesser during guess phase in active play', () => {
    expect(
      derivePhase(inputs({
        status: 'active',
        mySeat: 'B',
        currentClueGiver: 'A',
        hasCurrentTurnClue: true,
      })).cellsClickable,
    ).toBe(true)
  })

  it('is false for the clue-giver even during guess phase', () => {
    expect(
      derivePhase(inputs({
        status: 'active',
        mySeat: 'A',
        currentClueGiver: 'A',
        hasCurrentTurnClue: true,
      })).cellsClickable,
    ).toBe(false)
  })

  it('is false during the clue phase (no clue yet this turn)', () => {
    expect(
      derivePhase(inputs({
        status: 'active',
        mySeat: 'B',
        currentClueGiver: 'A',
        hasCurrentTurnClue: false,
      })).cellsClickable,
    ).toBe(false)
  })
})
