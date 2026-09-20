// cs-met-connections

/**
 * Wire types for the connections `board` jsonb column.
 *
 * The whole board — the categories answer key and the shuffled tile order —
 * is readable by every club member in both modes: the frontend knows the
 * answer (doc.md → Intro to area). Lives in lib/ so the evaluator and the
 * components import it alike.
 */

/** A board is four categories of four tiles; a game allows four mistakes. */
export const CATEGORY_COUNT = 4
export const TILES_PER_CATEGORY = 4
export const MISTAKE_BUDGET = 4

/** Difficulty rank of a category. 0..3 maps to NYT Connections'
 *  yellow/green/blue/purple bands in theme.css. "Rank" rather
 *  than "level" because "level" can mean too many other things
 *  (XP level, app routing level, puzzle difficulty level for a
 *  whole game). */
export type CategoryRank = 0 | 1 | 2 | 3

/** One of the four hidden categories in a board. `tiles` is the
 *  four-word answer; `name` is the category label shown when the
 *  category is matched and revealed as a band. */
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
