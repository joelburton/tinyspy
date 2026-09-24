// cs-blessed-codenamesduet

import type { TimerMode } from '@/common/manifest/gameManifest'
import type { SetupOf } from '@/common/setup-form/setupForm'

/**
 * codenamesduet's per-game setup — the choices collected by the
 * start-game dialog, persisted to `common.games.setup`, and
 * validated server-side in `codenamesduet.create_game` (the canonical
 * authority for what shapes are accepted).
 *
 * The literal-union on `turns` mirrors the SQL check; the
 * TypeScript narrowing here is advisory (a curious client could
 * always send something else). The server rejects anything that
 * doesn't match — see `create_game` in supabase/sql/codenamesduet.sql.
 */
export type CodenamesduetValues = {
  // Starting turn count. Matches the Duet rulebook's
  // mission/campaign starting values for easier difficulties (9
  // is the standard game; 10 and 11 are the easier missions).
  turns: 9 | 10 | 11
  // UUID of the club member who gives the first clue. The RPC
  // seats this user as A (since A always opens the game) and
  // the other member as B.
  first_clue_giver_user_id: string
  // Browser-side wall-clock timer mode. `none` (no clock) and
  // `countup` (informational) are display-only; `countdown`
  // flips the game to `lost_timeout` when the clock hits 0 (via
  // codenamesduet.submit_timeout). Validated server-side by
  // `common.require_valid_timer`.
  //
  // Distinct from the rulebook's `turns` above — that's the
  // in-game turn budget (the `turns_remaining` clock); this is the
  // external wall-clock countdown players can choose to layer
  // on top.
  timer: TimerMode
  // WHO IS PLAYING — a field like any other, and the only one that is not
  // part of the setup blob: `create_game` takes it as its own argument and
  // writes `common.game_players` rows from it.
  player_user_ids: Set<string>
}


/** What is SENT and STORED — every value the form collects except the players
 *  (see `SetupOf`). This is the shape `common.games.setup` holds, and what
 *  `setupSummary.ts` and `PlayArea` read back. */
export type CodenamesduetSetup = SetupOf<CodenamesduetValues>

/**
 * Initial setup the manifest hands the SetupGameModal wrapper
 * as `defaults`. `first_clue_giver_user_id` starts empty — the
 * defaults are evaluated at module-load time, before any club
 * is known, so a real user-id can't be filled in until the body
 * mounts inside a specific club's dialog. `SetupForm` seeds it with the
 * first selected player, and again whenever the chosen one is unticked.
 *
 * Timer defaults to `none` — Duet's pacing already comes from
 * the turn budget; a wall-clock countdown is opt-in for
 * players who want extra pressure.
 */
export const DEFAULT_CODENAMESDUET_SETUP: CodenamesduetSetup = {
  turns: 9,
  first_clue_giver_user_id: '',
  timer: { kind: 'none' },
}

/** The allowed `turns` values — drives the radio rendering. */
export const TURN_OPTIONS = [9, 10, 11] as const
