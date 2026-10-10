// cs-unmet

import type { FormErrors } from '@/common/forms/formState'
import type { GRoundStyle, GSetup } from '../types'

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
  return {}
}

/**
 * The initial setup: band 4 — Wordsy rewards long, rare words, so the default
 * sits a step above the roster's usual (plans/wordsy.md, decision 8) — and
 * the rulebook's 30-second round.
 */
export const DEFAULT_WORDSY_SETUP: GSetup = {
  timer: { kind: 'none' },
  legal_band: 4,
  round_style: 'timer',
}
