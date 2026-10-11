// cs-unmet

import type { FormErrors } from '@/common/forms/formState'
import type { GNRounds, GRoundStyle, GSetup } from '../types'

/*
 * wordsy's per-game setup — collected by the start-game dialog, persisted to
 * `common.games.setup`, validated server-side in `wordsy.create_game`. The
 * shape is `GSetupValues` / `GSetup`.
 */

/** The two round styles, as the form offers them. */
export const ROUND_STYLE_OPTIONS: { value: GRoundStyle; label: string }[] = [
  { value: 'timer', label: 'Timer' },
  { value: 'no-timer', label: 'No timer' },
]

/** The round clock's bounds, in seconds; `create_game` holds the same (PN558). */
export const TIMER_SECONDS_MIN = 1
export const TIMER_SECONDS_MAX = 120

/**
 * The Round row's words, for the form's section summary and the setup rows
 * alike: "30-second timer", "45-second timer, one word", "No timer". While
 * the seconds box holds no number, just "Timer". Coop is always one word, so
 * there the row does not say it.
 */
export function describeRound(
  setup: Pick<GSetup, 'round_style' | 'timer_seconds' | 'one_word'>,
  mode: 'coop' | 'compete',
): string {
  if (setup.round_style === 'no-timer') return 'No timer'
  const clock = Number.isInteger(setup.timer_seconds) ? `${setup.timer_seconds}-second timer` : 'Timer'
  return clock + (mode === 'compete' && setup.one_word ? ', one word' : '')
}

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
  if (!Number.isInteger(setup.timer_seconds)
      || setup.timer_seconds < TIMER_SECONDS_MIN || setup.timer_seconds > TIMER_SECONDS_MAX) {
    return { timer_seconds: `Pick ${TIMER_SECONDS_MIN} to ${TIMER_SECONDS_MAX} seconds.` }
  }
  if (setup.n_rounds !== 7 && setup.n_rounds !== 3) {
    return { n_rounds: 'Pick a length.' }
  }
  return {}
}

/**
 * Compete's initial setup: band 4 (doc.md → Setup says why it is a step above
 * the roster's usual), the rulebook's 30-second round, seven rounds, a word
 * that can change.
 */
export const DEFAULT_WORDSY_SETUP: GSetup = {
  timer: { kind: 'none' },
  legal_band: 4,
  round_style: 'timer',
  timer_seconds: 30,
  n_rounds: 7,
  one_word: false,
}

/**
 * Coop's initial setup: the same band and clock, and the card's fixed game —
 * the timer, seven rounds, the first word final — with free-for-all writing;
 * the Co-op section offers turns, and seeds `first_turn_user_id` itself.
 */
export const DEFAULT_WORDSY_SETUP_COOP: GSetup = {
  timer: { kind: 'none' },
  legal_band: 4,
  round_style: 'timer',
  timer_seconds: 30,
  n_rounds: 7,
  one_word: true,
  coop_style: 'free-for-all',
}
