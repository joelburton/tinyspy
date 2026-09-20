// cs-met-connections

/**
 * connections — the turn-history replay. Given the guess log, the static board
 * and a turn's row id, reconstruct what the board looked like *at the moment
 * that turn was submitted*, so PlayArea hands `<Board>` a snapshot the same
 * way it hands it the live board.
 *
 * The board MUTATES: a correct guess collapses its four tiles into a band, a
 * wrong or one-away guess leaves it alone. So the snapshot takes a
 * **strictly-before** boundary — the bands matched before this turn, and every
 * other tile still on the grid, THIS turn's four included even when it was
 * correct (they had not collapsed yet). Those four are then lit by what the
 * turn was.
 *
 * Addressed by the row's own id, resolved against the list being folded: the
 * `#N` the log prints counts the rows it is SHOWING, which a filter moves.
 * Which rows are folded is PlayArea's — the rows of whoever wrote the row
 * opened, so a compete terminal can replay an opponent's board.
 */
import type { Board, Category } from './board'
import type { EventRow, MatchedCategory } from '../hooks/useGame'
import type { Outcome } from '@/common/outcomes/outcomes'

export interface HistorySnapshot {
  // Bands matched by correct guesses STRICTLY BEFORE this turn (so this turn's
  // own tiles, if correct, are still on the grid). Feed straight to
  // `<Board matched>`.
  matched: MatchedCategory[]
  // The tiles on the grid at this turn — `board.tileOrder` minus the
  // strictly-before matched tiles. Feed straight to `<Board tiles>`.
  tiles: string[]
  // The four tiles this turn guessed — light them by what it was.
  historyLitTiles: Set<string>
  // What this turn was WORTH (`lib/answer.ts`'s answer, off the row) — the tint
  // the lit tiles take, in the same shared verdict color a live answer wears.
  outcome: Outcome
  // A short, name-free turn label for the viewer banner (the log row shows
  // *who*).
  historyLabel: string
}

/**
 * The board, the lit tiles and the banner label for the turn with this `id`:
 * every CORRECT guess strictly before it folded into the bands, and that
 * event's own four tiles lit. An id these rows do not hold folds nothing and
 * lights nothing.
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
    outcome: turn?.outcome ?? 'lost',
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
