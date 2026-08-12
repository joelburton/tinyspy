import type { TimerMode } from '../../common/lib/games'
import type { CoopTurnSetup } from '../../common/components/fields/CoopStyleField'

/**
 * wordiply's per-game setup — collected by the start-game dialog,
 * persisted to `common.games.setup`, validated server-side in
 * `wordiply.create_game`.
 *
 * **Mode is NOT on this type** — it's locked at the gametype level (the
 * sibling-manifest pattern), not a setup-time choice. Both manifests share
 * this same shape.
 *
 * There is no `target_rank` (wordiply isn't a race-to-rank) and no
 * separate "base" difficulty (the base is a letter-combination, not a
 * word — it has no difficulty). Just:
 *   - `difficulty` — the dictionary band the legal child words are drawn
 *     from (1..6). Higher = more obscure words count as legal guesses and
 *     can be the longest word. Both manifests default to 5.
 *   - `timer` — wall-clock mode (none / countup / countdown).
 *   - `custom_base` — an OPTIONAL player-chosen starter (see below).
 */
export type WordiplySetup = CoopTurnSetup & {
  timer: TimerMode
  /** Dictionary band for legal child words (1..6). */
  difficulty: number
  /**
   * An OPTIONAL player-chosen starter, 2–4 letters. Blank/absent means the
   * usual random board — the edge function samples a fragment as it always
   * has. Set it and the builder uses exactly these letters instead, which is
   * how you hand a friend a challenge ("try wordiply with MOTH").
   *
   * Because YOU picked it, a custom base plays by a relaxed gate: the
   * builder drops its child-count FLOOR (a random board wants ≥20 matching
   * words; yours needs only 1) and raises the ceiling to 1000. What it does
   * NOT drop is the headroom rule — the best possible word must still beat
   * the base by ≥3 letters, because a MOTH board whose best answer is MOTHER
   * isn't a game. See docs/games/wordiply.md → the base.
   *
   * Only the SHAPE is checked here (`customBaseError`); whether a base
   * actually yields a board is a dictionary question the frontend can't
   * answer without a round trip, so the edge function owns it and rejects at
   * Start — the same deal boggle's generation constraints get.
   *
   * Not saved as the club's next default: `create_game` strips it before
   * handing the setup to `common.create_game`. A one-off, not a baseline.
   */
  custom_base?: string
}

/**
 * Normalise a typed starter the way the server will read it: trimmed,
 * lowercased, and stripped of anything that isn't an ASCII letter (so a
 * stray space or hyphen doesn't turn into a confusing rejection). Truncated
 * to 4 — the input's own `maxLength` does this too, but paste doesn't always
 * respect it.
 *
 * Exported because the SetupForm cleans with it and `customBaseError`
 * validates what it produces; two different notions of "the same letters"
 * is exactly the drift this avoids.
 */
export function cleanBase(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z]/g, '').slice(0, 4)
}

/**
 * Why the optional custom starter is invalid, or `null` if it's fine
 * (including the common "left blank" case → a random board).
 *
 * SHAPE ONLY — 2–4 letters, which is `wordiply.games.base`'s own check
 * constraint. Whether those letters make a playable board is the edge
 * function's call (see the `custom_base` docs above), so this deliberately
 * does not try to guess.
 *
 * One line: the dialog's validation slot is single-line (nowrap+ellipsis),
 * and the section's own copy explains the leave-blank-for-random option.
 */
export function customBaseError(setup: WordiplySetup): string | null {
  const base = cleanBase(setup.custom_base ?? '')
  if (!base) return null // blank → a random starter
  if (base.length < 2) return 'A starter needs at least 2 letters.'
  return null
}

/**
 * The single Start-gate validator for both manifests: the difficulty band
 * must be 1..6, and the optional custom starter must be the right shape.
 * Returns the error string (which the dialog shows while disabling Start)
 * or `null` when the setup is valid. `create_game` re-checks server-side.
 */
export function wordiplySetupError(setup: WordiplySetup): string | null {
  if (setup.difficulty < 1 || setup.difficulty > 6) {
    return 'Difficulty must be between 1 and 6.'
  }
  return customBaseError(setup)
}

/**
 * Initial setup for the coop manifest. Band 5 (the classic "legal" band
 * the sibling word games use); the timer starts off.
 */
export const DEFAULT_WORDIPLY_SETUP_COOP: WordiplySetup = {
  timer: { kind: 'none' },
  difficulty: 5,
  // Coop pacing: free-for-all by default; the "Co-op" setup section (coop,
  // 2+ players) offers turn-by-turn. first_turn_user_id is seeded by the field.
  coop_style: 'free-for-all',
}

/**
 * Initial setup for the compete manifest — identical to coop (no
 * target_rank; the same difficulty band + timer choices apply).
 */
export const DEFAULT_WORDIPLY_SETUP_COMPETE: WordiplySetup = {
  timer: { kind: 'none' },
  difficulty: 5,
}
