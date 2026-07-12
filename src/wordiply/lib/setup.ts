import type { TimerMode } from '../../common/lib/games'

/**
 * wordiply's per-game setup — collected by the start-game dialog,
 * persisted to `common.games.setup`, validated server-side in
 * `wordiply.create_game`.
 *
 * **Mode is NOT on this type** — it's locked at the gametype level (the
 * sibling-manifest pattern), not a setup-time choice. Both manifests share
 * this same shape. `wordiply.create_game` rejects a `mode` field on setup
 * with a loud P0001, so a stale FE fails fast.
 *
 * There is no `target_rank` (wordiply isn't a race-to-rank) and no
 * separate "base" difficulty (the base is a letter-combination, not a
 * word — it has no difficulty). Just:
 *   - `difficulty` — the dictionary band the legal child words are drawn
 *     from (1..6). Higher = more obscure words count as legal guesses and
 *     can be the longest word. Both manifests default to 5.
 *   - `timer` — wall-clock mode (none / countup / countdown).
 */
export type WordiplySetup = {
  timer: TimerMode
  /** Dictionary band for legal child words (1..6). */
  difficulty: number
}

/**
 * The single Start-gate validator for both manifests: the difficulty band
 * must be 1..6. Returns the error string (which the dialog shows while
 * disabling Start) or `null` when the setup is valid. `create_game`
 * re-checks server-side.
 */
export function wordiplySetupError(setup: WordiplySetup): string | null {
  if (setup.difficulty < 1 || setup.difficulty > 6) {
    return 'Difficulty must be between 1 and 6.'
  }
  return null
}

/**
 * Initial setup for the coop manifest. Band 5 (the classic "legal" band
 * the sibling word games use); the timer starts off.
 */
export const DEFAULT_WORDIPLY_SETUP_COOP: WordiplySetup = {
  timer: { kind: 'none' },
  difficulty: 5,
}

/**
 * Initial setup for the compete manifest — identical to coop (no
 * target_rank; the same difficulty band + timer choices apply).
 */
export const DEFAULT_WORDIPLY_SETUP_COMPETE: WordiplySetup = {
  timer: { kind: 'none' },
  difficulty: 5,
}
