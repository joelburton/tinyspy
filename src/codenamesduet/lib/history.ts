// cs-met-codenamesduet

/**
 * codenamesduet — the turn-history replay. Given the fixed 25 board words, the
 * append-only guess log, and a turn's clue, reconstruct what the board looked like
 * at the END of any past turn plus which cells that turn decided — so PlayArea can
 * hand `<Board>` a historical board the same way it hands it the live one.
 *
 * ADD-style replay (like scrabble's `historyBoard` / waffle's `historyBoardAfter`, unlike
 * stackdown's removal): a guess only ever ADDS a reveal, so a past board is the
 * fixed words with every guess up to that turn folded onto them. The reveal alphabet
 * is codenamesduet's denormalized board state — the GLOBAL `revealed_as` ('G' agent
 * contacted / 'A' assassin) plus the PER-SEAT `neutral_a` / `neutral_b` marks (a
 * bystander on one seat's key may be the other's agent, so a neutral only locks the
 * guesser's direction — the Duet per-direction rule; see docs/games/codenamesduet.md).
 *
 * **Keyed by `turn_number`, not by a row's id.** Every other game's log lists
 * ROWS and addresses one by its `events.id`; duet's lists TURNS, and a turn is
 * one clue plus however many guesses answered it, under a game-wide
 * `unique (game_id, turn_number)`. The log renders "#N" = turn_number, so here
 * the number on screen and the handle behind it really are the same value.
 *
 * **The boundary is INCLUSIVE**: viewing turn N shows the board AFTER turn N's
 * guesses, with those cells ringed — "this is what turn N did" (a green/neutral
 * reveal IS the event, so we show it, then light it). Matches waffle/scrabble;
 * contrast stackdown's strictly-before boundary (its cleared tiles vanish, so it
 * shows the pre-move, fuller board).
 *
 * Pure (no React / supabase) + unit-tested, parallel to the other games' lib/history.
 * See docs/playarea.md for why turn-history drives the decomposition.
 */
import type { WordRow } from '../hooks/useBoard'
import type { ClueEvent, WordedGuess } from './events'

export interface HistorySnapshot {
  /** The 25 board words with reveal state as of the END of the viewed turn — feed
   *  straight to `<Board words>`. */
  words: WordRow[]
  /** The board positions this turn's guesses decided — ring these in the history
   *  blue ("added this turn"). Empty for a passed (guess-less) turn. */
  historyLitTiles: Set<number>
  /** A short, name-free turn label for the viewer banner (the log row shows *who*). */
  historyLabel: string
}

/**
 * Reconstruct the board + lit tiles + historyLabel for `turnNumber`. Folds every
 * guess with `turn_number <= turnNumber` onto the fixed words (INCLUSIVE), and
 * collects this turn's own guessed positions as the lit tiles.
 */
export function historySnapshot(
  words: WordRow[],
  guesses: ReadonlyArray<WordedGuess>,
  clue: ClueEvent | null,
  turnNumber: number,
): HistorySnapshot {
  const revealedAs = new Map<number, 'G' | 'A'>()
  const neutralA = new Set<number>()
  const neutralB = new Set<number>()
  const historyLitTiles = new Set<number>()

  for (const g of guesses) {
    if (g.turn_number > turnNumber) continue
    if (g.turn_number === turnNumber) historyLitTiles.add(g.guess_position)
    // A green / assassin reveal is GLOBAL + permanent; a neutral marks only the
    // guesser's own seat (the Duet per-direction rule — the partner can still
    // contact the word as their agent).
    if (g.guess_result === 'G') revealedAs.set(g.guess_position, 'G')
    else if (g.guess_result === 'A') revealedAs.set(g.guess_position, 'A')
    else if (g.seat === 'A') neutralA.add(g.guess_position)
    else neutralB.add(g.guess_position)
  }

  const snapWords = words.map((w) => ({
    ...w,
    revealed_as: revealedAs.get(w.position) ?? null,
    neutral_a: neutralA.has(w.position),
    neutral_b: neutralB.has(w.position),
  }))

  return { words: snapWords, historyLitTiles, historyLabel: describe(clue, guesses, turnNumber) }
}

/** "#3: 2 BREAD → STEEL, COFFEE" — the clue given that turn, then the words guessed
 *  in order (name-free; the log row already shows the clue-giver). A guess-less turn
 *  reads "…— passed". */
function describe(
  clue: ClueEvent | null,
  guesses: ReadonlyArray<WordedGuess>,
  turnNumber: number,
): string {
  const cluePart = clue ? `${clue.clue_count} ${clue.clue_word.toUpperCase()}` : '(no clue)'
  const guessed = guesses
    .filter((g) => g.turn_number === turnNumber)
    .sort((a, b) => a.id - b.id)
    .map((g) => g.word.toUpperCase())
  if (guessed.length === 0) return `#${turnNumber}: ${cluePart} — passed`
  return `#${turnNumber}: ${cluePart} → ${guessed.join(', ')}`
}
