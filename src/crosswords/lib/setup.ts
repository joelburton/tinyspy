import type { TimerMode } from '../../common/lib/games'

/**
 * The setup blob the dialog collects and `crosswords.create_game` /
 * `crosswords-import-nyt` validate. `mode` is NOT here — it's a top-level
 * manifest/RPC arg (the sibling-pair split). Crosswords has no timer, so
 * `timer` is always `{ kind: 'none' }` (present only because create_game
 * validates it).
 *
 * Two ways to source the puzzle:
 *   - `source: 'library'` → `puzzle_id` names a `crosswords.puzzles` row;
 *     start goes straight to the `create_game` RPC.
 *   - `source: 'nyt'` → `date` (YYYY-MM-DD) is fetched + imported by the
 *     `crosswords-import-nyt` edge function, which then creates the game.
 */
export type CrosswordsSetup = {
  timer: TimerMode
  source: 'library' | 'nyt'
  /** Library path. */
  puzzle_id?: string
  /** NYT path (YYYY-MM-DD). */
  date?: string
}

/** Default setup: no timer, library source, nothing picked yet (the form's
 *  `validate` blocks Start until a puzzle / date is chosen). */
export const CROSSWORDS_DEFAULTS: CrosswordsSetup = {
  timer: { kind: 'none' },
  source: 'library',
  puzzle_id: '',
}
