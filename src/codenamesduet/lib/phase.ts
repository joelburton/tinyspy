// cs-met-codenamesduet

/** A seat at the table. Seat A gives the first clue. */
export type Seat = 'A' | 'B'

/** The play states `derivePhase` reads, from `common.games.play_state`. */
export type GameStatus =
  | 'playing'
  | 'sudden_death'
  | 'won'
  | 'lost_assassin'
  | 'lost_clock'
  | 'lost_timeout'

/** The server state `derivePhase` decides from. */
export type PhaseInputs = {
  // Current common.games.play_state (gametype-specific string).
  status: GameStatus
  // games.current_clue_giver — null when the game has ended.
  currentClueGiver: Seat | null
  // The caller's seat in this game; undefined if they aren't seated.
  mySeat: Seat | undefined
  // True if a clue event exists for games.turn_number.
  hasCurrentTurnClue: boolean
}

/** What the play surface may do right now, as `derivePhase` answers it. */
export type PhaseDerived = {
  // Any terminal status (won / lost_*).
  gameOver: boolean
  // Convenience for status === 'sudden_death'.
  inSuddenDeath: boolean
  // "A clue exists, we're waiting for guesses."
  isGuessPhase: boolean
  // Caller is the player giving clues this turn.
  isClueGiver: boolean
  // Whether tiles should accept clicks right now. The matrix:
  //   - never if the game is over
  //   - always in sudden death (either player may guess)
  //   - in active play: only the non-clue-giver, only during guess phase
  cellsClickable: boolean
}

/**
 * The in-game UI state, derived from the bits of server state that decide
 * what the board and the clue strip can do right now. Pure, so the matrix of
 * (status × seat × phase) is tested as a plain function (`phase.test.ts`).
 */
export function derivePhase(inputs: PhaseInputs): PhaseDerived {
  const { status, currentClueGiver, mySeat, hasCurrentTurnClue } = inputs
  const gameOver = status !== 'playing' && status !== 'sudden_death'
  const inSuddenDeath = status === 'sudden_death'
  const isGuessPhase = hasCurrentTurnClue
  const isClueGiver = mySeat !== undefined && mySeat === currentClueGiver
  const cellsClickable =
    !gameOver &&
    (inSuddenDeath || (status === 'playing' && isGuessPhase && !isClueGiver))
  return { gameOver, inSuddenDeath, isGuessPhase, isClueGiver, cellsClickable }
}
