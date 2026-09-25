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
    inSuddenDeath: false,
    currentClueGiver: 'A',
    mySeat: 'A',
    hasCurrentTurnClue: false,
    pageIsMyTurn: true,
    isStillPlaying: true,
    myAgentsDone: false,
    peerAgentsDone: false,
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

describe('derivePhase — isMyTurn', () => {
  // The shared pointer names whoever must act now — the clue-giver, then the
  // guesser, then in sudden death the one player with words left — so the
  // page's `isMyTurn` is the answer, with ONE exception: sudden death with
  // words on both sides, where the pointer names nobody and the rulebook lets
  // either guess.

  it('is the page\'s answer in ordinary play', () => {
    expect(derivePhase(inputs({ pageIsMyTurn: true })).isMyTurn).toBe(true)
    expect(derivePhase(inputs({ pageIsMyTurn: false })).isMyTurn).toBe(false)
  })

  it('is the page\'s answer in sudden death when only one side has words', () => {
    // My partner's agents are all found, so I have nothing to guess: the
    // pointer names my partner.
    expect(derivePhase(inputs({
      inSuddenDeath: true, currentClueGiver: null, pageIsMyTurn: false, peerAgentsDone: true,
    })).isMyTurn).toBe(false)
  })

  it('is true for both in sudden death when both have words', () => {
    expect(derivePhase(inputs({
      inSuddenDeath: true, currentClueGiver: null, pageIsMyTurn: false,
    })).isMyTurn).toBe(true)
  })

  it('is false once I am no longer playing, even in sudden death with words on both sides', () => {
    expect(derivePhase(inputs({
      inSuddenDeath: true, currentClueGiver: null, pageIsMyTurn: false, isStillPlaying: false,
    })).isMyTurn).toBe(false)
  })
})

describe('derivePhase — isWaitingForTurn', () => {
  it('is true while I play and the move is my partner\'s', () => {
    expect(derivePhase(inputs({ pageIsMyTurn: false })).isWaitingForTurn).toBe(true)
  })

  it('is true in sudden death for the player with no words left', () => {
    expect(derivePhase(inputs({
      inSuddenDeath: true, currentClueGiver: null, pageIsMyTurn: false, peerAgentsDone: true,
    })).isWaitingForTurn).toBe(true)
  })

  it('is false for both in sudden death with words on both sides, and once I am not playing', () => {
    expect(derivePhase(inputs({
      inSuddenDeath: true, currentClueGiver: null, pageIsMyTurn: false,
    })).isWaitingForTurn).toBe(false)
    expect(derivePhase(inputs({ pageIsMyTurn: false, isStillPlaying: false })).isWaitingForTurn).toBe(false)
  })
})

describe('derivePhase — isBoardInteractive', () => {
  // The board takes a guess, and nothing else: the clue-giver holds the turn
  // too, but their move is the clue form.

  it('is true for the guesser once the clue is in', () => {
    expect(derivePhase(inputs({
      mySeat: 'B', currentClueGiver: 'A', hasCurrentTurnClue: true, pageIsMyTurn: true,
    })).isBoardInteractive).toBe(true)
  })

  it('is false for the clue-giver, whose move is the clue', () => {
    expect(derivePhase(inputs({
      mySeat: 'A', currentClueGiver: 'A', hasCurrentTurnClue: false, pageIsMyTurn: true,
    })).isBoardInteractive).toBe(false)
  })

  it('is false while my partner holds the move', () => {
    expect(derivePhase(inputs({
      mySeat: 'B', currentClueGiver: 'A', hasCurrentTurnClue: false, pageIsMyTurn: false,
    })).isBoardInteractive).toBe(false)
  })

  it('in sudden death, is true for whoever may guess, and false for the player with no words', () => {
    expect(derivePhase(inputs({
      inSuddenDeath: true, currentClueGiver: null, pageIsMyTurn: false,
    })).isBoardInteractive).toBe(true)
    expect(derivePhase(inputs({
      inSuddenDeath: true, currentClueGiver: null, pageIsMyTurn: false, peerAgentsDone: true,
    })).isBoardInteractive).toBe(false)
  })

  it('is false once I am no longer playing', () => {
    expect(derivePhase(inputs({
      mySeat: 'B', hasCurrentTurnClue: true, pageIsMyTurn: false, isStillPlaying: false,
    })).isBoardInteractive).toBe(false)
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
