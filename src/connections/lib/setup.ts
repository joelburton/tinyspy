import type { TimerMode } from '../../common/lib/games'

/**
 * connections's per-game setup — the choices collected by the
 * start-game dialog, persisted to `common.games.setup`, and
 * validated server-side in `connections.create_game`.
 *
 * Two fields today:
 *   - `puzzleId` — the `connections.puzzles` row the game is sourced
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
export type ConnectionsSetup = {
  puzzleId: string
  timer: TimerMode
}

/**
 * Initial setup the manifest hands the SetupGameDialog wrapper
 * as `defaults`. `puzzleId` starts empty — the defaults are
 * evaluated at module-load time, before any puzzles are
 * fetched, so the real id can't be filled in until the form
 * body mounts. The SetupForm resolves the real default on mount:
 * the club's saved default (last puzzle started), stepping one
 * day forward if it's already been finished, else the most-recent
 * imported puzzle. The timer starts off; players choose a clock
 * (or not) in the setup dialog.
 */
export const DEFAULT_CONNECTIONS_SETUP: ConnectionsSetup = {
  puzzleId: '',
  timer: { kind: 'none' },
}
