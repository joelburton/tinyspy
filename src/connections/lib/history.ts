/**
 * connections — the turn-history replay. Given the guess log, the static board, and
 * the position of a turn within the log, reconstruct what the board looked like *at
 * the moment that turn was submitted* — so PlayArea can hand `<Board>` a historical
 * snapshot the same way it hands it the live board.
 *
 * connections's board MUTATES: a **correct** guess collapses its 4 tiles into a
 * colored band (they leave the grid); a wrong / oneAway guess leaves the board
 * unchanged. That makes it the removal-style twin of stackdown (a guess "consumes"
 * tiles into a band like stackdown clears a word off the stack) — so this uses the
 * same **strictly-before** boundary: the snapshot for the turn at `index` shows the
 * bands matched by correct guesses at positions `< index`, and every other tile
 * still on the grid. That leaves THIS turn's own 4 tiles on the board (even a
 * correct guess's — they haven't collapsed yet), which is exactly what we want,
 * because we then ring + tint those 4 in the turn's outcome color ("this is the
 * group this turn guessed, and here's how it went").
 *
 * **Keyed by log position** (guesses have no per-turn ordinal; ordered by
 * `guessed_at`). The log renders "#N" = position.
 *
 * Pure (no React / supabase) + unit-tested, parallel to the other games' lib/history.
 * Compete's `guesses` are RLS-scoped to the caller, so a compete viewer replays only
 * their own board — the projection degenerates naturally.
 */
import type { Board, Category } from './board'
import type { GuessRow, MatchedCategory } from '../hooks/useGame'

export interface TurnSnapshot {
  /** Bands matched by correct guesses STRICTLY BEFORE this turn (so this turn's own
   *  tiles, if correct, are still on the grid). Feed straight to `<Board matched>`. */
  matched: MatchedCategory[]
  /** The tiles on the grid at this turn — `board.tileOrder` minus the strictly-before
   *  matched tiles. Feed straight to `<Board tiles>`. */
  tiles: string[]
  /** The four tiles this turn guessed — ring + tint them in the outcome color. */
  highlightTiles: Set<string>
  /** This turn's verdict — drives the highlight color (correct = green / oneAway =
   *  amber / wrong = red). */
  outcome: GuessRow['result']
  /** A short, name-free turn label for the viewer banner (the log row shows *who*). */
  description: string
}

/**
 * Reconstruct the board + highlight + description for the turn at `index`. Folds
 * every CORRECT guess at a position `< index` into the matched bands (strictly
 * before), and marks this turn's own 4 tiles as the highlight.
 */
export function turnSnapshot(
  guesses: ReadonlyArray<GuessRow>,
  board: Board,
  index: number,
): TurnSnapshot {
  const categoryByRank = new Map<number, Category>(board.categories.map((c) => [c.rank, c]))
  const matched: MatchedCategory[] = []
  const matchedTiles = new Set<string>()
  for (let i = 0; i < index && i < guesses.length; i++) {
    const g = guesses[i]
    if (g.result !== 'correct' || g.matched_category_rank == null) continue
    const cat = categoryByRank.get(g.matched_category_rank)
    if (!cat) continue
    matched.push({ rank: cat.rank, name: cat.name, tiles: cat.tiles, matched_at: g.guessed_at })
    for (const t of cat.tiles) matchedTiles.add(t)
  }
  const tiles = board.tileOrder.filter((t) => !matchedTiles.has(t))
  const turn = guesses[index]
  return {
    matched,
    tiles,
    highlightTiles: new Set(turn?.tiles ?? []),
    outcome: turn?.result ?? 'wrong',
    description: describe(turn, board),
  }
}

/** The verdict label — a correct guess names the category it matched; the other two
 *  carry the NYT-canonical short copy (matching the turn log's `verdictLabel`). */
function describe(turn: GuessRow | undefined, board: Board): string {
  if (!turn) return 'This turn'
  if (turn.result === 'correct') {
    const cat =
      turn.matched_category_rank != null
        ? board.categories.find((c) => c.rank === turn.matched_category_rank)
        : undefined
    return cat ? `Matched ${cat.name.toUpperCase()}` : 'Correct'
  }
  if (turn.result === 'oneAway') return 'One away!'
  return 'Not a match'
}
