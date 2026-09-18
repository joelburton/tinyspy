// cs-unmet

/**
 * psychicnum — the turn-history replay. Given the guess log and the position of a
 * turn within it, reconstruct what the board looked like at that turn (which tiles
 * had been decided, and as what) plus which tile that turn decided — so PlayArea can
 * hand `<Board>` a historical `results` map the same way it hands it the live one.
 *
 * ADD-style replay (like scrabble/waffle/codenamesduet, unlike stackdown's removal):
 * a guess only ever ADDS a permanent green/red mark, so a past board is the guesses
 * up to that turn folded into the same `word → is_correct` map the live board uses.
 * A word is guessable only once (the server rejects re-guesses), so the fold never
 * overwrites. Hint / spoiler turns mark no tile (they decide nothing), so they leave
 * the map unchanged and light nothing.
 *
 * **Addressed by the row's own id**, resolved against the list being folded. The
 * `#N` the log prints is that row's place in whatever the log is SHOWING, which a
 * filter moves; the rows the board replays are a different list.
 *
 * **The boundary is INCLUSIVE**: viewing a turn shows the board AFTER
 * that turn's guess, with the guessed tile ringed — "this is the tile this turn
 * decided" (the natural way to review it; the reveal IS the event). Matches
 * waffle/scrabble/codenamesduet.
 *
 * Pure (no React / supabase) + unit-tested, parallel to the other games' lib/history.
 */
import type { EventRow } from '../hooks/useGame'

export interface HistorySnapshot {
  /** Guessed words → was-it-a-secret, as of the END of the viewed turn — feed
   *  straight to `<Board results>`. */
  results: Map<string, boolean>
  /** The board word this turn's guess decided — ring it history-blue (it already
   *  wears its green/red outcome color). Null for a hint / spoiler turn (no tile). */
  historyLitWord: string | null
  /** A short, name-free turn label for the viewer banner (the log row shows *who*). */
  historyLabel: string
}

/**
 * Reconstruct the results + lit word + historyLabel for the event with this
 * `id`. Folds every guess (kind `'guess'`) up to and including it into the
 * results map (INCLUSIVE), and picks that event's own guessed word as the lit
 * one.
 *
 * Addressed by the ROW'S ID, resolved against the list being folded — not by a
 * position in it. The number the log prints is the row's place in whatever the
 * log is SHOWING, which a filter changes; the board replays the rows it is
 * looking at, which a filter does not. They are different lists, so they cannot
 * share an index.
 */
export function historySnapshot(
  guesses: ReadonlyArray<EventRow>,
  id: number,
): HistorySnapshot {
  const index = guesses.findIndex((g) => g.id === id)
  const results = new Map<string, boolean>()
  for (let i = 0; i <= index && i < guesses.length; i++) {
    const g = guesses[i]
    if (g.kind === 'guess') results.set(g.word, g.is_correct)
  }
  const turn = guesses[index]
  const historyLitWord = turn && turn.kind === 'guess' ? turn.word : null
  return { results, historyLitWord, historyLabel: describe(turn) }
}

/** The kind-aware turn label. A guess reads as its outcome; a spoiler names the answer
 *  word; a hint carries its clue text in `word` (never the secret — no leak). */
function describe(turn: EventRow | undefined): string {
  if (!turn) return 'This turn'
  const word = turn.word.toUpperCase()
  if (turn.kind === 'hint') return `Hint: ${turn.word}`
  if (turn.kind === 'spoiler') return `Revealed ${word}`
  return turn.is_correct ? `${word} — a secret!` : `${word} — not a secret`
}
