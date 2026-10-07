// cs-blessed-connections

/**
 * connections — the turn-history replay. Given the guess log, the puzzle and
 * a turn's row id, reconstruct what the board looked like *at the moment that
 * turn was submitted*, so PlayArea hands `<Board>` a snapshot the same way it
 * hands it the live board.
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
 * Which rows are folded is `useHistoryView`'s — the rows of whoever wrote the
 * row opened, so an ended compete game can replay an opponent's board.
 */
import type { GCategory, GEvent, GMatchedCat, GPuzzle, GReplayedTurn } from '../types'

/**
 * The board, the lit tiles and the banner label for the turn with this `id`:
 * every CORRECT guess strictly before it folded into the bands, and that
 * event's own four tiles lit. An id these rows do not hold folds nothing and
 * lights nothing.
 */
export function replayTurn(
  events: ReadonlyArray<GEvent>,
  puzzle: GPuzzle,
  id: number,
): GReplayedTurn {
  // -1 when the id names a row this list does not hold — a compete opponent's
  // guess against your own board. Nothing folds, and nothing is lit.
  const index = events.findIndex((e) => e.id === id)
  const catByRank = new Map<number, GCategory>(puzzle.cats.map((c) => [c.rank, c]))
  const matchedCats: GMatchedCat[] = []
  // The ids of the tiles the bands took.
  const banded = new Set<string>()
  for (let i = 0; i < index && i < events.length; i++) {
    const e = events[i]!
    if (!e.matched || e.matchedCatRank === null) continue
    // A correct row names a rank `submit_guess` checked against 0..3, and the
    // puzzle carries all four.
    const cat = catByRank.get(e.matchedCatRank)!
    matchedCats.push({ ...cat, matchedAt: e.at })
    for (const t of cat.tiles) banded.add(t.id)
  }
  const turn = events[index]
  return {
    board: {
      matchedCats,
      tilesLeft: puzzle.tiles.filter((t) => !banded.has(t.id)),
    },
    litTileIds: new Set(turn?.tiles.map((t) => t.id) ?? []),
    outcome: turn?.outcome ?? 'lost',
    label: describe(turn, puzzle),
  }
}

/** The verdict label — a correct guess names the category it matched; the other two
 *  carry the NYT-canonical short text (matching the event log's `verdictLabel`). */
function describe(turn: GEvent | undefined, puzzle: GPuzzle): string {
  if (!turn) return 'This turn'
  if (turn.matched) {
    const cat =
      turn.matchedCatRank !== null
        ? puzzle.cats.find((c) => c.rank === turn.matchedCatRank)
        : undefined
    return cat ? `Matched ${cat.name.toUpperCase()}` : 'Correct'
  }
  if (turn.result === 'oneAway') return 'One away!'
  return 'Not a match'
}
