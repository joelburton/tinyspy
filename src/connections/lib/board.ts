// cs-blessed-connections

/**
 * Wire types for the connections `board` jsonb column.
 *
 * The whole board — the categories answer key and the shuffled tile order —
 * is readable by every club member in both modes: the frontend knows the
 * answer (doc.md → Intro to area). Lives in lib/ so the evaluator and the
 * components import it alike.
 */

/** How many categories a board hides — matching them all is the win. */
export const CATEGORY_COUNT = 4
/** How many tiles make a category, and so a guess. */
export const TILES_PER_CATEGORY = 4
/** How many mistakes a player (coop: the team) may make before losing. */
export const MISTAKE_BUDGET = 4

/** A category's difficulty index, 0..3 — NYT's yellow / green / blue /
 *  purple, the band colors in theme.css. */
export type CategoryRank = 0 | 1 | 2 | 3

/** One of the four hidden categories in a board. `tiles` is the four-word
 *  answer; `name` is what the band says once the category is matched. */
export type Category = {
  rank: CategoryRank
  name: string
  tiles: string[]
}

/** The full board as persisted on `connections.games.board` — what the
 *  evaluator and `Board` read. */
export type Board = {
  categories: Category[]
  /** The 16 tiles in their shuffled display order. The FE renders
   *  in this order; the server shuffles once at create_game time. */
  tileOrder: string[]
}
