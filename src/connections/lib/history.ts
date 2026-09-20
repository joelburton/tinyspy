// cs-met-connections

/**
 * connections — the turn-history replay. Given the guess log, the static board, and
 * the position of a turn within the log, reconstruct what the board looked like *at
 * the moment that turn was submitted* — so PlayArea can hand `<Board>` a historical
 * snapshot the same way it hands it the live board.
 *
 * connections's board MUTATES: a **correct** guess collapses its 4 tiles into a
 * colored band (they leave the grid); a wrong / one-away guess leaves the board
 * unchanged. That makes it the removal-style twin of stackdown (a guess "consumes"
 * tiles into a band like stackdown clears a word off the stack) — so this uses the
 * same **strictly-before** boundary: a turn's snapshot shows the
 * bands matched by correct guesses strictly before it, and every other tile
 * still on the grid. That leaves THIS turn's own 4 tiles on the board (even a
 * correct guess's — they haven't collapsed yet), which is exactly what we want,
 * because we then ring + tint those 4 in the turn's outcome color ("this is the
 * group this turn guessed, and here's how it went").
 *
 * **Addressed by the row's own id**, resolved against the list being folded. The
 * `#N` the log prints counts the rows it is SHOWING, which a filter moves.
 *
 * Pure (no React / supabase) + unit-tested, parallel to the other games' lib/history.
 * Which rows are folded is PlayArea's: the rows of whoever wrote the row opened,
 * so a compete terminal can replay an opponent's board as easily as your own.
 */
import type { Board, Category } from './board'
import type { EventRow, MatchedCategory } from '../hooks/useGame'
import type { Answer } from './answer'

export interface HistorySnapshot {
  /** Bands matched by correct guesses STRICTLY BEFORE this turn (so this turn's own
   *  tiles, if correct, are still on the grid). Feed straight to `<Board matched>`. */
  matched: MatchedCategory[]
  /** The tiles on the grid at this turn — `board.tileOrder` minus the strictly-before
   *  matched tiles. Feed straight to `<Board tiles>`. */
  tiles: string[]
  /** The four tiles this turn guessed — ring + tint them by what it was. */
  historyLitTiles: Set<string>
  /** This turn's verdict, as the three-value wire word — which is what the lit
   *  tiles' tint keys on, there being exactly three of those and seven
   *  outcomes. What it is WORTH is `lib/answer.ts`'s. */
  result: Answer
  /** A short, name-free turn label for the viewer banner (the log row shows *who*). */
  historyLabel: string
}

/**
 * Reconstruct the board + lit tiles + historyLabel for the turn with this `id`.
 * Folds every CORRECT guess strictly before it into the matched bands, and marks
 * that event's own 4 tiles as the lit ones.
 *
 * Addressed by the ROW'S ID, resolved against the list being folded — the log's
 * number is a position in what is SHOWN, and a filter moves it.
 */
export function historySnapshot(
  guesses: ReadonlyArray<EventRow>,
  board: Board,
  id: number,
): HistorySnapshot {
  // -1 when the id names a row this list does not hold — a compete opponent's
  // guess against your own board. Nothing folds, and nothing is lit.
  const index = guesses.findIndex((g) => g.id === id)
  const categoryByRank = new Map<number, Category>(board.categories.map((c) => [c.rank, c]))
  const matched: MatchedCategory[] = []
  const matchedTiles = new Set<string>()
  for (let i = 0; i < index && i < guesses.length; i++) {
    const g = guesses[i]
    if (!g.matched || g.matched_category_rank == null) continue
    const cat = categoryByRank.get(g.matched_category_rank)
    if (!cat) continue
    matched.push({ rank: cat.rank, name: cat.name, tiles: cat.tiles, matched_at: g.created_at })
    for (const t of cat.tiles) matchedTiles.add(t)
  }
  const tiles = board.tileOrder.filter((t) => !matchedTiles.has(t))
  const turn = guesses[index]
  return {
    matched,
    tiles,
    historyLitTiles: new Set(turn?.tiles ?? []),
    result: turn?.result ?? 'wrong',
    historyLabel: describe(turn, board),
  }
}

/** The verdict label — a correct guess names the category it matched; the other two
 *  carry the NYT-canonical short text (matching the event log's `verdictLabel`). */
function describe(turn: EventRow | undefined, board: Board): string {
  if (!turn) return 'This turn'
  if (turn.matched) {
    const cat =
      turn.matched_category_rank != null
        ? board.categories.find((c) => c.rank === turn.matched_category_rank)
        : undefined
    return cat ? `Matched ${cat.name.toUpperCase()}` : 'Correct'
  }
  if (turn.result === 'oneAway') return 'One away!'
  return 'Not a match'
}
