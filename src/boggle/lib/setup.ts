// cs-unmet

import type { FormErrors } from '@/common/forms/formState'
import { LADDERS } from './solver'
import { DICE_BY_NAME } from './dice'
import { parseCustomBoard } from './customBoard'
import type { GSetup } from '../types'

/** The `win_percent` dropdown options: None (null) + 50…100 by 5. */
export const WIN_PERCENT_OPTIONS: ReadonlyArray<number | null> = [
  null, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100,
]

/** Coop default: 4×4 Revised board, familiar band, standard scoring, no timer. */
export const DEFAULT_BOGGLE_SETUP_COOP: GSetup = {
  timer: { kind: 'none' },
  dice_set: '4',
  band: 3,
  legal_band: 5,
  min_word_length: 3,
  scoring_ladder: 'basic',
  win_percent: null,
  constraints: {
    minWordLength: 3,
    ladder: "basic",
    minWords: 10,
    maxWords: undefined,
    minScore: 20,
    maxScore: undefined,
    minLongest: 5,
    maxLongest: undefined,
  }
}

/** Compete shares the coop defaults (mode is a positional RPC arg). */
export const DEFAULT_BOGGLE_SETUP_COMPETE: GSetup = { ...DEFAULT_BOGGLE_SETUP_COOP }

/** Cross-field guard for the Start button. Pure + synchronous; `create_game`
 *  re-validates server-side (this is UX, not the authority). */
export function legalError(s: GSetup): FormErrors {
  // Six checks over six different controls, and each one says which. Before
  // these carried their field they all landed on the dialog's bottom line, so
  // "Difficulty band must be 1–6" and "Minimum word length must be 3–9" arrived
  // in the same place and you worked out which select they meant.
  if (!DICE_BY_NAME[s.dice_set]) return { dice_set: `Unknown dice set: ${s.dice_set}` }
  if (s.band < 1 || s.band > 6) return { band: 'Difficulty band must be 1–6' }
  if (s.legal_band < s.band || s.legal_band > 6) {
    return { legal_band: 'Legal-word band must be between the required band and 6' }
  }
  if (s.min_word_length < 3 || s.min_word_length > 9) {
    return { min_word_length: 'Minimum word length must be 3–9' }
  }
  if (!(s.scoring_ladder in LADDERS)) {
    return { scoring_ladder: `Unknown scoring ladder: ${s.scoring_ladder}` }
  }
  if (
    s.win_percent !== null &&
    (s.win_percent < 50 || s.win_percent > 100 || s.win_percent % 5 !== 0)
  ) {
    return { win_percent: 'Win target must be 50–100% in steps of 5, or None' }
  }
  return {}
}

/**
 * Why the optional custom board is unusable, or `null` if it's fine (including
 * the common "left blank" case → a rolled board).
 *
 * The tile count is judged against the DICE SET currently picked, since that's
 * what fixes the board's side length — paste a 5×5 while the dialog says 4×4
 * and this says so, rather than guessing which of the four 5×5 sets you meant.
 * `parseCustomBoard` owns the reading itself, and the edge function calls the
 * same function server-side; this is the fail-fast, not the authority.
 */
export function customBoardError(s: GSetup): FormErrors {
  const text = (s.custom_board ?? '').trim()
  if (!text) return {} // blank → roll a board, the normal path
  const set = DICE_BY_NAME[s.dice_set]
  // An unknown dice set is `legalError`'s to report, and it runs first; without
  // a set there's no side length to check the tile count against.
  if (!set) return {}
  const parsed = parseCustomBoard(text, set.n)
  return parsed.ok ? {} : { custom_board: parsed.error }
}

/**
 * The single Start-gate validator for both manifests: the cross-field setup
 * rules OR the custom-board rules, whichever fails first (the manifest's
 * `validate` shows the returned string and disables Start until it's `null`).
 * Mirrors freebee's `spellingbeeSetupError`.
 */
export function boggleSetupError(s: GSetup): FormErrors {
  return { ...legalError(s), ...customBoardError(s) }
}
