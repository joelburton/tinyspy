import type { TimerMode } from '../../common/lib/games'

/**
 * spellingbee's per-game setup — collected by the start-game dialog,
 * persisted to `common.games.setup`, validated server-side in
 * `spellingbee.create_game`.
 *
 * **Mode is NOT on this type** — it's locked at the gametype
 * level (the sibling-manifest pattern), not a setup-time choice.
 * Clicking "Start spellingbee (coop)" vs "(compete)" is what picks
 * mode; both manifests share this same setup shape. The
 * `spellingbee.create_game` RPC rejects a `mode` field on setup with
 * a loud P0001 — so a stale FE that still embeds it fails fast
 * rather than silently mismatching.
 *
 * Fields:
 *   - `timer` — wall-clock mode (none / countup / countdown).
 *     Per-game rather than per-gametype so friends can pick
 *     their own challenge each session.
 *   - `target_rank` — REQUIRED when starting from the compete
 *     manifest; absent when starting from the coop manifest.
 *     0..6 maps to the Start..Genius rank ladder. Compete wins
 *     when the first player reaches this rank.
 *   - `required` / `legal` — the vocabulary bands. `required`
 *     (2..6) is where the displayed goal words come from; `legal`
 *     (required..6) is the wider set of accepted/bonus words. The
 *     board pool is selected at the band-2 floor, so any choice is
 *     solvable; `legal` must contain `required` (see
 *     `spellingbeeLegalError`).
 *
 * Deferred fields (designed-in, FE not yet wiring them):
 *   - `custom_letters` + `custom_center` — a player-specified
 *     puzzle override; bypasses the random builder.
 */
export type SpellingbeeSetup = {
  timer: TimerMode
  /** Required in compete, absent in coop. Optional on the type
   *  because both manifests share it; the per-mode default
   *  factories below seed the field iff compete. */
  target_rank?: number
  /** Required-words band (2..6); see the type-level notes. */
  required: number
  /** Legal/bonus-words band (required..6). */
  legal: number
  custom_letters?: string
  custom_center?: string
}

/**
 * Why the current `legal` band is too low to start, or `null`: the legal set
 * must contain the required set, so `legal >= required`. The dialog gates Start
 * on this (via the manifest's `validate`); `create_game` re-checks server-side.
 */
export function spellingbeeLegalError(setup: SpellingbeeSetup): string | null {
  if (setup.legal < setup.required) {
    return `Legal words must reach at least the required band (${setup.required}).`
  }
  return null
}

/**
 * Initial setup for the coop manifest — no `target_rank` (coop
 * has no win-rank to race to; see the type's field notes). The
 * timer starts off; players pick a clock in the setup dialog.
 */
export const DEFAULT_SPELLINGBEE_SETUP_COOP: SpellingbeeSetup = {
  timer: { kind: 'none' },
  required: 3,
  legal: 5,
}

/**
 * Initial setup for the compete manifest. Adds `target_rank: 5`
 * (Amazing — the second-toughest tier on the 7-rank ladder). The
 * SetupForm surfaces a picker so the choice is changeable per
 * game; the default is the "decisive race without being a slog"
 * pick from the design conversation.
 */
export const DEFAULT_SPELLINGBEE_SETUP_COMPETE: SpellingbeeSetup = {
  timer: { kind: 'none' },
  target_rank: 5,
  required: 3,
  legal: 5,
}
