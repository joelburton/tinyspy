// cs-blessed-codenamesduet

/** A seat at the table. Seat A gives the first clue. */
export type Seat = 'A' | 'B'

/** The server state `derivePhase` decides from. */
export type PhaseInputs = {
  // The shell's `isTerminal` — the one answer to "is the game over?".
  isTerminal: boolean
  // play_state is 'sudden_death': the budget is spent and nobody clues.
  inSuddenDeath: boolean
  // games.current_clue_giver — null in sudden death and once the game has ended.
  currentClueGiver: Seat | null
  // The caller's seat in this game; undefined if they aren't seated.
  mySeat: Seat | undefined
  // True if a clue event exists for games.turn_number.
  hasCurrentTurnClue: boolean
}

/** What the play surface may do right now, as `derivePhase` answers it. */
export type PhaseDerived = {
  // "A clue exists, we're waiting for guesses."
  isGuessPhase: boolean
  // Caller is the player giving clues this turn.
  isClueGiver: boolean
  // Whether tiles should accept clicks right now. The matrix:
  //   - never if the game is over
  //   - always in sudden death (either player may guess)
  //   - otherwise: only the non-clue-giver, only during guess phase
  cellsClickable: boolean
}

/**
 * The in-game UI state, derived from the bits of server state that decide
 * what the board and the clue strip can do right now. Pure, so the matrix of
 * (over × sudden death × seat × phase) is tested as a plain function
 * (`phase.test.ts`).
 */
export function derivePhase(inputs: PhaseInputs): PhaseDerived {
  const { isTerminal, inSuddenDeath, currentClueGiver, mySeat, hasCurrentTurnClue } = inputs
  const isGuessPhase = hasCurrentTurnClue
  const isClueGiver = mySeat !== undefined && mySeat === currentClueGiver
  const cellsClickable = !isTerminal && (inSuddenDeath || (isGuessPhase && !isClueGiver))
  return { isGuessPhase, isClueGiver, cellsClickable }
}

/** The reveal state of one board word — the columns `isGuessable` reads. */
type WordReveal = {
  revealed_as: string | null
  neutral_a: boolean
  neutral_b: boolean
}

/**
 * May the player in `mySeat` guess this word — on a board whose cells are
 * clickable at all? Not once it is revealed, and not once *I* hit it as a
 * bystander; a bystander only my partner hit stays guessable, since it may be
 * my agent (the Duet rule). A click and the keyboard's Space both ask this.
 */
export function isGuessable(word: WordReveal, mySeat: Seat): boolean {
  const iNeutraled = mySeat === 'A' ? word.neutral_a : word.neutral_b
  return word.revealed_as === null && !iNeutraled
}
