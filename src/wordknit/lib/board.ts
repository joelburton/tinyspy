/**
 * Wire types for the wordknit `board` jsonb column.
 *
 * The whole board (groups answer key + shuffled tile order)
 * is publicly readable in the v1 deployment — see the
 * "FE-knows-the-answer" note in
 * supabase/migrations/*_wordknit_baseline.sql and
 * docs/wordknit.md for the architectural rationale.
 *
 * Lives in lib/ so both the evaluator and the manifest /
 * components can import it without dragging in the wider
 * board screen code.
 */

/** NYT Connections difficulty levels — yellow/green/blue/purple
 *  in the FE's theme.css color tokens. */
export type GroupLevel = 0 | 1 | 2 | 3

/** One of the four hidden categories in a board. `members` is
 *  the four-word answer; `group` is the category name shown when
 *  the group is revealed. */
export type Group = {
  level: GroupLevel
  group: string
  members: string[]
}

/** The full board as persisted on `wordknit.games.board`. The
 *  evaluator and the BoardScreen both read from this shape. */
export type Board = {
  groups: Group[]
  /** The 16 tiles in their shuffled display order. The FE renders
   *  in this order; the server shuffles once at create_game time. */
  tileOrder: string[]
}
