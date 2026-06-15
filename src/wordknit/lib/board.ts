/**
 * Wire types for the wordknit `board` jsonb column.
 *
 * The whole board (categories answer key + shuffled tile order)
 * is publicly readable in the v1 deployment — see the
 * "FE-knows-the-answer" note in
 * supabase/migrations/*_wordknit_baseline.sql and
 * docs/wordknit.md for the architectural rationale.
 *
 * Lives in lib/ so both the evaluator and the manifest /
 * components can import it without dragging in the wider
 * board screen code.
 */

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

/** The full board as persisted on `wordknit.games.board`. The
 *  evaluator and the BoardScreen both read from this shape. */
export type Board = {
  categories: Category[]
  /** The 16 tiles in their shuffled display order. The FE renders
   *  in this order; the server shuffles once at create_game time. */
  tileOrder: string[]
}
