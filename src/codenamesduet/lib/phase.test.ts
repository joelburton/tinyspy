// cs-blessed-codenamesduet

/**
 * Tests for `derivePhase` — the pure function that decides which UI
 * state the play surface is in given whether the game is over or in sudden
 * death, the seats, and whether a clue exists — and for `isGuessable`, which
 * word on a clickable board may be guessed.
 *
 * The matrix of inputs is small enough that every interesting combination is
 * enumerated here.
 */

import { describe, expect, it } from 'vitest'
import { derivePhase, isGuessable, type PhaseInputs } from './phase'

/** Reusable defaults so each test only states what it changes. */
function inputs(overrides: Partial<PhaseInputs> = {}): PhaseInputs {
  return {
    isTerminal: false,
    inSuddenDeath: false,
    currentClueGiver: 'A',
    mySeat: 'A',
    hasCurrentTurnClue: false,
    ...overrides,
  }
}

describe('derivePhase — isClueGiver', () => {
  it('is true when mySeat matches the current clue-giver', () => {
    expect(derivePhase(inputs({ mySeat: 'A', currentClueGiver: 'A' })).isClueGiver).toBe(true)
  })

  it('is false when seats differ', () => {
    expect(derivePhase(inputs({ mySeat: 'B', currentClueGiver: 'A' })).isClueGiver).toBe(false)
  })

  it('is false when the current clue-giver is null (sudden death, or game over)', () => {
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
  //   isTerminal                                → never
  //   sudden death (regardless of seat)       → always
  //   guess phase + not clue-giver            → yes (the guesser's window)
  //   clue phase                              → no (no clue to guess against)
  //   guess phase + clue-giver                → no (you submitted the clue)

  it('is false when the game is over, for the guesser in a guess phase too', () => {
    expect(
      derivePhase(inputs({ isTerminal: true, mySeat: 'B', hasCurrentTurnClue: true })).cellsClickable,
    ).toBe(false)
  })

  it('is true in sudden death for either seat', () => {
    expect(
      derivePhase(inputs({ inSuddenDeath: true, mySeat: 'A', currentClueGiver: null })).cellsClickable,
    ).toBe(true)
    expect(
      derivePhase(inputs({ inSuddenDeath: true, mySeat: 'B', currentClueGiver: null })).cellsClickable,
    ).toBe(true)
  })

  it('is true for the guesser during guess phase in active play', () => {
    expect(
      derivePhase(inputs({
        mySeat: 'B',
        currentClueGiver: 'A',
        hasCurrentTurnClue: true,
      })).cellsClickable,
    ).toBe(true)
  })

  it('is false for the clue-giver even during guess phase', () => {
    expect(
      derivePhase(inputs({
        mySeat: 'A',
        currentClueGiver: 'A',
        hasCurrentTurnClue: true,
      })).cellsClickable,
    ).toBe(false)
  })

  it('is false during the clue phase (no clue yet this turn)', () => {
    expect(
      derivePhase(inputs({
        mySeat: 'B',
        currentClueGiver: 'A',
        hasCurrentTurnClue: false,
      })).cellsClickable,
    ).toBe(false)
  })
})

describe('isGuessable', () => {
  const word = (over: Partial<{ revealed_as: string | null; neutral_a: boolean; neutral_b: boolean }> = {}) =>
    ({ revealed_as: null, neutral_a: false, neutral_b: false, ...over })

  it('an untouched word is guessable by either seat', () => {
    expect(isGuessable(word(), 'A')).toBe(true)
    expect(isGuessable(word(), 'B')).toBe(true)
  })

  it('a revealed word is guessable by nobody', () => {
    expect(isGuessable(word({ revealed_as: 'G' }), 'A')).toBe(false)
    expect(isGuessable(word({ revealed_as: 'A' }), 'B')).toBe(false)
  })

  // The Duet rule: a bystander I hit is closed to me; one my partner hit may
  // still be my agent.
  it('a bystander closes the word only for the seat that hit it', () => {
    expect(isGuessable(word({ neutral_a: true }), 'A')).toBe(false)
    expect(isGuessable(word({ neutral_a: true }), 'B')).toBe(true)
    expect(isGuessable(word({ neutral_b: true }), 'B')).toBe(false)
    expect(isGuessable(word({ neutral_b: true }), 'A')).toBe(true)
  })
})
