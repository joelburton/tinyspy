/**
 * Pure derivation of the in-game UI state from the bits of server
 * state that drive what the BoardScreen can do right now.
 *
 * Pulled out of BoardScreen so the matrix of (status × seat × phase)
 * is testable as a plain function instead of rendering the component
 * with mocked hooks.
 */

export type Seat = 'A' | 'B'

export type GameStatus =
  | 'lobby'
  | 'active'
  | 'sudden_death'
  | 'won'
  | 'lost_assassin'
  | 'lost_clock'

export type PhaseInputs = {
  /** Current games.status. */
  status: GameStatus
  /** games.current_clue_giver — null when the game has ended. */
  currentClueGiver: Seat | null
  /** The caller's seat in this game; undefined if they aren't seated. */
  mySeat: Seat | undefined
  /** True if a clue row exists for games.turn_number. */
  hasCurrentTurnClue: boolean
}

export type PhaseDerived = {
  /** Any terminal status (won / lost_*). */
  gameOver: boolean
  /** Convenience for status === 'sudden_death'. */
  inSuddenDeath: boolean
  /** "A clue exists, we're waiting for guesses." */
  isGuessPhase: boolean
  /** Caller is the player giving clues this turn. */
  isClueGiver: boolean
  /**
   * Whether tiles should accept clicks right now. The matrix:
   *   - never if the game is over
   *   - always in sudden death (either player may guess)
   *   - in active play: only the non-clue-giver, only during guess phase
   */
  cellsClickable: boolean
}

export function derivePhase(inputs: PhaseInputs): PhaseDerived {
  const { status, currentClueGiver, mySeat, hasCurrentTurnClue } = inputs
  const gameOver = status !== 'active' && status !== 'sudden_death'
  const inSuddenDeath = status === 'sudden_death'
  const isGuessPhase = hasCurrentTurnClue
  const isClueGiver = mySeat !== undefined && mySeat === currentClueGiver
  const cellsClickable =
    !gameOver &&
    (inSuddenDeath || (status === 'active' && isGuessPhase && !isClueGiver))
  return { gameOver, inSuddenDeath, isGuessPhase, isClueGiver, cellsClickable }
}
