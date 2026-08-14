import type { TimerMode } from '../../common/lib/games'
import type { CoopTurnSetup } from '../../common/components/fields/CoopStyleField'

/**
 * connections's per-game setup — the choices collected by the
 * start-game dialog, persisted to `common.games.setup`, and
 * validated server-side in `connections.create_game`.
 *
 * Two fields today:
 *   - `puzzleId` — the `connections.puzzles` row the game is sourced from,
 *     and OPTIONAL because the dialog no longer collects it: absence is how
 *     `create_game` is told to derive the next puzzle none of the selected
 *     players has played (`connections.next_puzzle_for_club`). It stays in
 *     the type because the RPC still honours an explicit id, which is what
 *     the pgTAP and e2e fixtures pin their assertions to.
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
export type ConnectionsSetup = CoopTurnSetup & {
  puzzleId?: string
  timer: TimerMode
}

/**
 * Initial setup the manifest hands the SetupGameDialog wrapper as `defaults`.
 *
 * NO `puzzleId` KEY AT ALL — not `''`. The server reads an ABSENT puzzleId as
 * "you choose"; an empty string is present-but-unparseable and would fail the
 * uuid cast with `bad-puzzle-id|` instead. It used to be `''` because the
 * defaults are evaluated at module-load time, before any puzzle list had been
 * fetched, and the form filled the real id in on mount — there is no list and
 * no picker now.
 */
export const DEFAULT_CONNECTIONS_SETUP: ConnectionsSetup = {
  timer: { kind: 'none' },
  // Coop pacing: free-for-all by default; the "Co-op" setup section (coop,
  // 2+ players) offers turn-by-turn. first_turn_user_id is seeded by the field.
  coop_style: 'free-for-all',
}
