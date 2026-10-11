// cs-unmet

import type { FormErrors } from '@/common/forms/formState'
import type { GNRounds, GRoundStyle, GSetup } from '../types'

/*
 * wordsy's per-game setup — collected by the start-game dialog, persisted to
 * `common.games.setup`, validated server-side in `wordsy.create_game`. The
 * shape is `GSetupValues` / `GSetup`.
 */

/** The two round styles, as the form offers them and the rows name them. */
export const ROUND_STYLE_OPTIONS: { value: GRoundStyle; label: string }[] = [
  { value: 'timer', label: '30-second timer' },
  { value: 'no-timer', label: 'No timer' },
]

/** The two lengths, as the form offers them and the rows name them. */
export const N_ROUNDS_OPTIONS: { value: GNRounds; label: string }[] = [
  { value: 7, label: '7 rounds, best 5' },
  { value: 3, label: '3 rounds, best 2' },
]

/**
 * The Start-gate validator. Returns the errors keyed by field (the dialog
 * shows them while disabling Start), or none when the setup is valid.
 * `create_game` re-checks server-side.
 */
export function wordsySetupError(setup: GSetup): FormErrors {
  if (!Number.isInteger(setup.legal_band) || setup.legal_band < 1 || setup.legal_band > 6) {
    return { legal_band: 'Pick a dictionary.' }
  }
  if (setup.round_style !== 'timer' && setup.round_style !== 'no-timer') {
    return { round_style: 'Pick how a round ends.' }
  }
  if (setup.n_rounds !== 7 && setup.n_rounds !== 3) {
    return { n_rounds: 'Pick a length.' }
  }
  return {}
}

/**
 * The initial setup: band 4 (doc.md → Setup says why it is a step above the
 * roster's usual), the rulebook's 30-second round, seven rounds, a word that
 * can change.
 */
export const DEFAULT_WORDSY_SETUP: GSetup = {
  timer: { kind: 'none' },
  legal_band: 4,
  round_style: 'timer',
  n_rounds: 7,
  one_word: false,
}
