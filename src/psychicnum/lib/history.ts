/**
 * psychicnum — the turn-history replay. Given the guess log and the position of a
 * turn within it, reconstruct what the board looked like at that turn (which tiles
 * had been decided, and as what) plus which tile that turn decided — so PlayArea can
 * hand `<WordBoard>` a historical `results` map the same way it hands it the live one.
 *
 * ADD-style replay (like scrabble/waffle/codenamesduet, unlike stackdown's removal):
 * a guess only ever ADDS a permanent green/red mark, so a past board is the guesses
 * up to that turn folded into the same `word → was_correct` map the live board uses.
 * A word is guessable only once (the server rejects re-guesses), so the fold never
 * overwrites. Hint / reveal turns mark no tile (they're free helpers), so they leave
 * the map unchanged and highlight nothing.
 *
 * **Keyed by log position, not a stored id.** psychicnum's `guesses` has no per-turn
 * ordinal the FE indexes by; the log renders "#N" = its `guessed_at`-sorted position,
 * which is unambiguous and chronological — exactly what a shared-board replay needs.
 *
 * **The boundary is INCLUSIVE**: viewing the turn at `index` shows the board AFTER
 * that turn's guess, with the guessed tile ringed — "this is the tile this turn
 * decided" (the natural way to review it; the reveal IS the event). Matches
 * waffle/scrabble/codenamesduet.
 *
 * Pure (no React / supabase) + unit-tested, parallel to the other games' lib/history.
 */
import type { GuessRow } from '../hooks/useGame'

export interface TurnSnapshot {
  /** Guessed words → was-it-a-secret, as of the END of the viewed turn — feed
   *  straight to `<WordBoard results>`. */
  results: Map<string, boolean>
  /** The board word this turn's guess decided — ring it history-yellow (it already
   *  wears its green/red outcome color). Null for a hint / reveal turn (no tile). */
  highlightWord: string | null
  /** A short, name-free turn label for the viewer banner (the log row shows *who*). */
  description: string
}

/**
 * Reconstruct the results + highlight + description for the turn at `index`. Folds
 * every guess (kind `'guess'`) up to and including `index` into the results map
 * (INCLUSIVE), and picks that turn's own guessed word as the highlight.
 */
export function turnSnapshot(
  guesses: ReadonlyArray<GuessRow>,
  index: number,
): TurnSnapshot {
  const results = new Map<string, boolean>()
  for (let i = 0; i <= index && i < guesses.length; i++) {
    const g = guesses[i]
    if (g.kind === 'guess') results.set(g.word, g.was_correct)
  }
  const turn = guesses[index]
  const highlightWord = turn && turn.kind === 'guess' ? turn.word : null
  return { results, highlightWord, description: describe(turn) }
}

/** The kind-aware turn label. A guess reads as its outcome; a reveal names the answer
 *  word; a hint carries its clue text in `word` (never the secret — no leak). */
function describe(turn: GuessRow | undefined): string {
  if (!turn) return 'This turn'
  const word = turn.word.toUpperCase()
  if (turn.kind === 'hint') return `Hint: ${turn.word}`
  if (turn.kind === 'reveal') return `Revealed ${word}`
  return turn.was_correct ? `${word} — a secret!` : `${word} — not a secret`
}
