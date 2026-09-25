// cs-blessed-codenamesduet

/** A seat at the table. Seat A gives the first clue. */
export type Seat = 'A' | 'B'

/** The server state `derivePhase` decides from. */
export type PhaseInputs = {
  // play_state is 'sudden_death': the budget is spent and nobody clues.
  inSuddenDeath: boolean
  // games.current_clue_giver — null in sudden death and once the game has ended.
  currentClueGiver: Seat | null
  // The caller's seat in this game; undefined if they aren't seated.
  mySeat: Seat | undefined
  // True if a clue event exists for games.turn_number.
  hasCurrentTurnClue: boolean
  // The page's `isMyTurn`: still playing, and the shared pointer names me.
  // The server points it at whoever must act now (`codenamesduet._point_turn`).
  pageIsMyTurn: boolean
  // The page's `isStillPlaying`.
  isStillPlaying: boolean
  // My agents are all found — my partner has nothing left to guess in sudden
  // death, which reads a guess off the partner's key.
  myAgentsDone: boolean
  // My partner's agents are all found — I have nothing left to guess.
  peerAgentsDone: boolean
}

/** What the play surface may do right now, as `derivePhase` answers it. */
export type PhaseDerived = {
  // "A clue exists, we're waiting for guesses."
  isGuessPhase: boolean
  // Caller is the player giving clues this turn.
  isClueGiver: boolean
  // The standing terms by their meanings in docs/win-lose.md → Where a player
  // stands, as this game supplies them. The move is mine: the page's answer,
  // except in sudden death with words on both sides, where the pointer names
  // nobody and the rulebook lets either player guess.
  isMyTurn: boolean
  // Still playing, and the move is my partner's.
  isWaitingForTurn: boolean
  // The board takes a guess: the move is mine and it is a guess — the guess
  // phase, or sudden death. The clue-giver holds the turn too, but their move
  // is the clue form, not the board.
  isBoardInteractive: boolean
}

/**
 * The in-game UI state, derived from the bits of server state that decide
 * what the board and the clue strip can do right now. Pure, so the matrix of
 * (sudden death × seat × phase × whose move × who has words) is tested as a
 * plain function (`phase.test.ts`).
 */
export function derivePhase(inputs: PhaseInputs): PhaseDerived {
  const {
    inSuddenDeath, currentClueGiver, mySeat, hasCurrentTurnClue,
    pageIsMyTurn, isStillPlaying, myAgentsDone, peerAgentsDone,
  } = inputs
  const isGuessPhase = hasCurrentTurnClue
  const isClueGiver = mySeat !== undefined && mySeat === currentClueGiver
  const bothHaveWords = !myAgentsDone && !peerAgentsDone
  const isMyTurn = inSuddenDeath && bothHaveWords ? isStillPlaying : pageIsMyTurn
  const isWaitingForTurn = isStillPlaying && !isMyTurn
  const isBoardInteractive = isMyTurn && (inSuddenDeath || isGuessPhase)
  return { isGuessPhase, isClueGiver, isMyTurn, isWaitingForTurn, isBoardInteractive }
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
