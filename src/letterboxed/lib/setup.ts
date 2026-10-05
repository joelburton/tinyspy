// cs-unmet

import type { FormErrors } from '@/common/forms/formState'
import type { GSetup } from '../types'
import { parseSides } from './customBoard'

/**
 * Why the optional custom board is invalid, or `null` if it's fine (including
 * the common "left blank" case → a random board). `parseSides` owns the
 * reading; the edge function calls the same function server-side, so this is
 * the fail-fast rather than the authority.
 */
export function customSidesError(setup: GSetup): FormErrors {
  const typed = setup.custom_sides ?? ''
  if (!typed) return {} // blank → a random board
  const parsed = parseSides(typed)
  return parsed.ok ? {} : { custom_sides: parsed.error }
}

/**
 * The single Start-gate validator for both manifests. Returns the error string
 * (which the dialog shows while disabling Start) or `null` when the setup is
 * valid. `create_game` re-checks server-side.
 */
export function letterboxedSetupError(setup: GSetup): FormErrors {
  if (setup.extra_words < 0 || setup.extra_words > 5) {
    return { extra_words: 'Spare words must be between 0 and 5.' }
  }
  if (setup.legal_band < 1 || setup.legal_band > 6) {
    return { legal_band: 'Dictionary must be between 1 and 6.' }
  }
  return customSidesError(setup)
}

/**
 * Initial setup for the coop manifest. Three spare words (a cap of five) is
 * roomy — the board is always solvable in two, so it leaves plenty of scenic
 * routes — and band 5 is the generous "legal" band the sibling word games use.
 */
export const DEFAULT_LETTERBOXED_SETUP_COOP: GSetup = {
  timer: { kind: 'none' },
  extra_words: 3,
  legal_band: 5,
  // Coop pacing: free-for-all by default; the "Co-op" setup section (coop, 2+
  // players) offers turn-by-turn — which suits this game unusually well, since
  // the chain hands off naturally ("I ended on T, you start on T").
  coop_style: 'free-for-all',
}

/** Initial setup for the compete manifest — identical knobs, no coop pacing. */
export const DEFAULT_LETTERBOXED_SETUP_COMPETE: GSetup = {
  timer: { kind: 'none' },
  extra_words: 3,
  legal_band: 5,
}
