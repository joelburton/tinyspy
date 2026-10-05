// cs-unmet

import type { FormErrors } from '@/common/forms/formState'
import type { GSetup } from '../types'

/**
 * Normalize a typed starter the way the server will read it: trimmed,
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
export function customBaseError(setup: GSetup): FormErrors {
  const base = cleanBase(setup.custom_base ?? '')
  if (!base) return {} // blank → a random starter
  if (base.length <
    2) return { custom_base: 'A starter needs at least 2 letters.' }
  return {}
}

/**
 * The single Start-gate validator for both manifests: the difficulty band
 * must be 1..6, and the optional custom starter must be the right shape.
 * Returns the error string (which the dialog shows while disabling Start)
 * or `null` when the setup is valid. `create_game` re-checks server-side.
 */
export function wordiplySetupError(setup: GSetup): FormErrors {
  if (setup.difficulty < 1 || setup.difficulty > 6) {
    return { difficulty: 'Difficulty must be between 1 and 6.' }
  }
  return customBaseError(setup)
}

/**
 * Initial setup for the coop manifest. Band 5 (the classic "legal" band
 * the sibling word games use); the timer starts off.
 */
export const DEFAULT_WORDIPLY_SETUP_COOP: GSetup = {
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
export const DEFAULT_WORDIPLY_SETUP_COMPETE: GSetup = {
  timer: { kind: 'none' },
  difficulty: 5,
}
