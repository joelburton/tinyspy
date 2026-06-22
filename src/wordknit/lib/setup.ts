import type { TimerMode } from '../../common/lib/games'

/**
 * wordknit's per-game setup — the choices collected by the
 * start-game dialog, persisted to `common.games.setup`, and
 * validated server-side in `wordknit.create_game`.
 *
 * Two fields today:
 *   - `puzzleId` — the `wordknit.puzzles` row the game is sourced
 *     from. The setup form's date picker resolves a date to its
 *     puzzle id. Required; the RPC raises P0001 if missing.
 *   - `timer` — wall-clock mode. Per-game rather than per-
 *     gametype because Joel wants groups to pick their own
 *     challenge per puzzle ("can you solve this in 5 minutes?"
 *     vs "let's enjoy ourselves without a clock").
 *
 * Future fields (e.g. difficulty filter on the picker) land
 * alongside. The jsonb storage on `common.games.setup`
 * accommodates new optional fields without schema churn — only
 * the RPC's shape validator changes.
 */
export type WordKnitSetup = {
  puzzleId: string
  timer: TimerMode
}

/**
 * Initial setup the manifest hands the SetupGameDialog wrapper
 * as `defaults`. `puzzleId` starts empty — the defaults are
 * evaluated at module-load time, before any puzzles are
 * fetched, so the real id can't be filled in until the form
 * body mounts. The SetupForm auto-picks today's puzzle (or the
 * most-recent available) on mount. The timer starts off; players
 * choose a clock (or not) in the setup dialog.
 */
export const DEFAULT_WORDKNIT_SETUP: WordKnitSetup = {
  puzzleId: '',
  timer: { kind: 'none' },
}
