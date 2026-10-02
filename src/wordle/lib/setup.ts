// cs-blessed-wordle

import type { FormErrors } from '@/common/forms/formState'
import type { GSetup } from '../types'

/** Initial setup the manifest hands the dialog as `defaults`. Defaults to the
 *  classic game: the NYT answer list (answer band 0), guesses accepted up to
 *  band 4. */
export const DEFAULT_WORDLE_SETUP: GSetup = {
  max_guesses: 6,
  answer_band: 0,
  legal_band: 4,
  timer: { kind: 'none' },
  // Coop pacing: free-for-all by default; the setup dialog's "Co-op"
  // section (coop, 2+ players) offers turn-by-turn. first_turn_user_id is
  // seeded by the field when turns is picked.
  coop_style: 'free-for-all',
}

/** The guess-budget choices the form offers (5–8; 6 is classic). */
export const GUESS_OPTIONS: ReadonlyArray<number> = [5, 6, 7, 8]

/** Every wordle word is five letters: the target, a guess, a board row, and
 *  the dictionary slice the two band controls offer. One home, so the board,
 *  the entry, the form and the printer cannot disagree. */
export const WORD_LENGTH = 5

/**
 * The hardest band a possible answer can be — the floor `legal_band` must
 * reach, since every possible answer has to be a word the game accepts as a
 * guess.
 *
 * The real bands 1..6 accumulate: band N is every word at difficulty N or
 * easier, so band 2 contains all of band 1. An answer band of N therefore tops
 * out at N. Answer band 0 is not a band: it is the curated NYT-Wordle answer
 * list, which matches neither band 1 nor band 2 — but every word on it is at
 * band 2 or easier, so it tops out at 2. (Kept in sync with the same rule in
 * `wordle.create_game`.)
 */
export function answerMaxBand(setup: GSetup): number {
  return setup.answer_band === 0 ? 2 : setup.answer_band
}

/**
 * Why the current `legal_band` band is too low to start, or `null`. A guess
 * must be able to spell any possible answer, so `legal_band` has to reach the
 * answer's hardest band. The dialog gates Start on this (via the manifest's
 * `validate`); `create_game` re-checks server-side.
 */
export function legalError(setup: GSetup): FormErrors {
  const min = answerMaxBand(setup)
  if (setup.legal_band < min) {
    // Under `legal_band`, not `answer_band`, though moving EITHER can cause
    // it: the legal band is the one the sentence asks you to raise, and its own
    // select disables everything below the floor, so the other field has
    // nothing wrong with it to ring.
    return {
      legal_band: `Legal guesses must reach at least band ${min}, so every possible answer is itself a guessable word.`,
    }
  }
  return {}
}
