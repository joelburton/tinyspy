// cs-blessed-psychicnum

import type { GSetup } from '../types'

/**
 * Initial setup the manifest hands the SetupGameModal wrapper
 * as `defaults`. A 10-word board at the Familiar band (3) is a
 * gentle baseline, with no clock.
 */
export const DEFAULT_PSYCHICNUM_SETUP: GSetup = {
  max_guesses: 7,
  word_count: 10,
  band: 3,
  timer: { kind: 'none' },
  // Coop pacing defaults to free-for-all; the setup
  // dialog's "Co-op" section (coop, 2+ players) offers turn-by-turn.
  // first_turn_user_id is omitted here — the field seeds it to a real
  // player once turns is picked (a member id can't live in a default).
  coop_style: 'free-for-all',
}

/** The allowed `max_guesses` values — drives the radio rendering. */
export const GUESS_OPTIONS = [3, 5, 7, 9] as const

/** Inclusive bounds for the board's word count (the setup picker range). */
export const WORD_COUNT_MIN = 5
export const WORD_COUNT_MAX = 20

/** The selectable board-size values, `WORD_COUNT_MIN`..`WORD_COUNT_MAX`. */
export const WORD_COUNT_OPTIONS = Array.from(
  { length: WORD_COUNT_MAX - WORD_COUNT_MIN + 1 },
  (_, i) => WORD_COUNT_MIN + i,
)
