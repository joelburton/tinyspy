import type { TimerMode } from '../../common/lib/games'

/**
 * Freebee's per-game setup — collected by the start-game dialog,
 * persisted to `common.games.setup`, validated server-side in
 * `freebee.create_game`.
 *
 * v1 fields:
 *   - `mode` — `'coop'` (shared found list, no winner) for v1.
 *     `'compete'` is designed-in at the schema / RPC / RLS level
 *     but the FE never sets it yet. See docs/freebee.md →
 *     "Designing for compete (future)" for the wider rationale.
 *   - `timer` — wall-clock mode (none / countup / countdown).
 *     Per-game rather than per-gametype so friends can pick
 *     their own challenge each session.
 *
 * Deferred fields (designed-in, FE not yet wiring them):
 *   - `target_rank` — required when `mode === 'compete'`,
 *     absent when `mode === 'coop'`.
 *   - `custom_letters` + `custom_center` — a player-specified
 *     puzzle override; bypasses the random builder.
 *
 * The deferred fields are optional on the type so a future PR
 * can populate them without changing every existing call site.
 */
export type FreebeeSetup = {
  mode: 'coop' | 'compete'
  timer: TimerMode
  target_rank?: number
  custom_letters?: string
  custom_center?: string
}

/**
 * Initial setup the manifest hands the SetupGameDialog wrapper
 * as `defaults`.
 *
 * 10-minute countdown is the default per the wider pattern —
 * matches wordknit's and psychic-num's default timer choices,
 * and it's a reasonable "you have to actually play" length
 * without being punishing.
 */
export const DEFAULT_FREEBEE_SETUP: FreebeeSetup = {
  mode: 'coop',
  timer: { kind: 'countdown', seconds: 600 },
}
