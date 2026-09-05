// cs-unmet

import type { TimerMode } from '@/common/manifest/gameManifest'
import type { SetupOf } from '@/common/setup-form/setupForm'
import type { CoopTurnSetup } from '@/common/setup-form/SetupCoopStyleSection'

/**
 * connections's per-game setup — the choices collected by the
 * start-game dialog, persisted to `common.games.setup`, and
 * validated server-side in `connections.create_game`.
 *
 * Two fields today:
 *   - `puzzle_id` — the `connections.puzzles` row the game is sourced from,
 *     and OPTIONAL because the dialog no longer collects it: absence is how
 *     `create_game` is told to derive the next puzzle none of the selected
 *     players has played (`connections.next_puzzle_for_club`). It stays in
 *     the type because the RPC still honors an explicit id, which is what
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
export type ConnectionsValues = CoopTurnSetup & {
  puzzle_id?: string
  timer: TimerMode
  /** WHO IS PLAYING — a field like any other, and the only one that is not
   *  part of the setup blob: `create_game` takes it as its own argument and
   *  writes `common.game_players` rows from it. */
  player_user_ids: Set<string>
}


/** What is SENT and STORED — every value the form collects except the players
 *  (see `SetupOf`). This is the shape `common.games.setup` holds, and what
 *  `setupSummary.ts` and `PlayArea` read back. */
export type ConnectionsSetup = SetupOf<ConnectionsValues>
/**
 * Initial setup the manifest hands the SetupGameModal wrapper as `defaults`.
 *
 * NO `puzzle_id` KEY AT ALL — not `''`. The server reads an ABSENT puzzle_id as
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

/**
 * What both puzzle-picker RPCs put in `data` — `next_puzzle_for_club` and
 * `puzzle_for_date`, which answer in the same shape so the shared
 * `<SetupNextPuzzleSection>` can take either.
 *
 * ONE answer: there is a puzzle. Not finding one is a refusal, not a quieter
 * success — PN302 for a spent archive, PN303 for a date with nothing on it —
 * because it blocks starting a game and the thing that fixes it is a control on
 * the form.
 *
 * Here rather than in a component, because the setup dialog and the in-game New
 * Game path both ask.
 */
export type PuzzleAnswer = {
  result: 'found'
  puzzle: { id: string; puzzle_date: string; label: string }
}
