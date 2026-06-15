import type { TimerMode } from '../../common/lib/games'

/**
 * Wordknit's per-game setup — the choices collected by the
 * start-game dialog, persisted to `wordknit.games.setup`, and
 * validated server-side in `wordknit.create_game`.
 *
 * Today's one option: timer mode (none / countup / countdown
 * with a player-chosen duration). The choice is per-game rather
 * than per-gametype because Joel wants groups to pick their own
 * challenge per puzzle ("can you solve this in 5 minutes?" vs
 * "let's just enjoy ourselves without a clock").
 *
 * Future fields land alongside `timer` as the puzzle archive
 * and other setup options arrive. The jsonb storage on
 * `games.setup` accommodates new optional fields without
 * schema churn — only the RPC's shape validator changes.
 */
export type WordknitSetup = {
  timer: TimerMode
}

/**
 * Initial setup the manifest hands the SetupGameDialog wrapper
 * as `defaults`. A 10-minute count-down is a reasonable default
 * for the POC's hardcoded board — solvable but with a real
 * sense of clock. Players who want no clock or count-up can
 * switch in the setup dialog.
 */
export const DEFAULT_WORDKNIT_SETUP: WordknitSetup = {
  timer: { kind: 'countdown', seconds: 600 },
}

/**
 * Bounds for the count-down picker. Joel's call: minimum 1
 * second (no zero-length games), max 60 minutes (1 hour is
 * plenty for any wordknit-style puzzle). Server-side validator
 * agrees — see the migration.
 */
export const MIN_COUNTDOWN_SECONDS = 1
export const MAX_COUNTDOWN_SECONDS = 60 * 60
