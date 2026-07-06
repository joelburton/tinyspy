import type { TimerMode } from '../../common/lib/games'
// Type-only so `setup.ts` (eagerly loaded via the manifest) doesn't pull the
// parser + puzjs into the main bundle — those load lazily with the SetupForm.
import type { ImportedBoard } from './importFile'

/**
 * The setup blob the dialog collects and `crosswords.create_game` /
 * `crosswords-import-nyt` validate. `mode` is NOT here — it's a top-level
 * manifest/RPC arg (the sibling-pair split). Crosswords has no timer, so
 * `timer` is always `{ kind: 'none' }` (present only because create_game
 * validates it).
 *
 * Three ways to source the puzzle:
 *   - `source: 'library'` → `puzzle_id` names a `crosswords.puzzles` row;
 *     start goes straight to the `create_game` RPC.
 *   - `source: 'nyt'` → `date` (YYYY-MM-DD) is fetched + imported by the
 *     `crosswords-import-nyt` edge function, which then creates the game.
 *   - `source: 'upload'` → the FE parses an uploaded `.puz`/`.ipuz` into
 *     `board` ({meta, solution}) client-side and passes it to `create_game`'s
 *     inline `board` arg (self-contained game, no `puzzles` row — like NYT).
 */
export type CrosswordsSetup = {
  timer: TimerMode
  source: 'library' | 'nyt' | 'upload'
  /** Library path. */
  puzzle_id?: string
  /** NYT path (YYYY-MM-DD). */
  date?: string
  /** Upload path: the parsed board. FE-only — `startGameInClub` passes it as
   *  the `board` arg and STRIPS it from the `setup` blob create_game persists,
   *  so the solution never lands in the (unshielded) status / saved-default. */
  board?: ImportedBoard
  /** Upload path: the source filename, for display in the form. */
  filename?: string
}

/** Default setup: no timer, library source, nothing picked yet (the form's
 *  `validate` blocks Start until a puzzle / date is chosen). */
export const CROSSWORDS_DEFAULTS: CrosswordsSetup = {
  timer: { kind: 'none' },
  source: 'library',
  puzzle_id: '',
}
