import type { TimerMode } from '../../common/lib/games'
// Type-only so `setup.ts` (eagerly loaded via the manifest) doesn't pull the
// parser + puzjs into the main bundle — those load lazily with the SetupForm.
import type { ImportedBoard } from './importFile'

/**
 * The setup blob the dialog collects and `crosswords.create_game` /
 * `crosswords-import-nyt` / `crosswords-import-guardian` validate. `mode` is
 * NOT here — it's a top-level manifest/RPC arg (the sibling-pair split).
 * Crosswords has no timer, so `timer` is always `{ kind: 'none' }` (present
 * only because create_game validates it).
 *
 * Four ways to source the puzzle:
 *   - `source: 'library'` → `puzzle_id` names a `crosswords.puzzles` row;
 *     start goes straight to the `create_game` RPC.
 *   - `source: 'nyt'` → `date` (YYYY-MM-DD) is fetched + imported by the
 *     `crosswords-import-nyt` edge function, which then creates the game.
 *   - `source: 'guardian'` → `series` (quick / cryptic / …) picks the outlet;
 *     the `crosswords-import-guardian` edge function fetches TODAY's puzzle in
 *     that series and creates the game. Public (no auth).
 *   - `source: 'upload'` → the FE parses an uploaded `.puz`/`.ipuz` into
 *     `board` ({meta, solution}) client-side and passes it to `create_game`'s
 *     inline `board` arg (self-contained game, no `puzzles` row — like NYT).
 */
export type CrosswordsSetup = {
  timer: TimerMode
  source: 'library' | 'nyt' | 'guardian' | 'upload'
  /** Library path. */
  puzzle_id?: string
  /** NYT path (YYYY-MM-DD). */
  date?: string
  /** Guardian path: the series slug (see GUARDIAN_SERIES). */
  series?: string
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

/** The Guardian series the import offers, slug → display label. Kept in FE +
 *  edge-fn agreement (the edge fn's own allowlist is the authority; this is
 *  the picker's copy). Quick/Cryptic/etc publish answers same-day; Prize and
 *  Weekend withhold them until a reveal date, so a same-day start of those may
 *  fail with "answers aren't published yet". */
export const GUARDIAN_SERIES: { slug: string; label: string }[] = [
  { slug: 'quick', label: 'Quick' },
  { slug: 'cryptic', label: 'Cryptic' },
  { slug: 'everyman', label: 'Everyman' },
  { slug: 'speedy', label: 'Speedy' },
  { slug: 'quiptic', label: 'Quiptic' },
  { slug: 'prize', label: 'Prize (answers reveal later)' },
  { slug: 'weekend-crossword', label: 'Weekend (answers reveal later)' },
]
