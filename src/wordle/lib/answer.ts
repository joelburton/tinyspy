// cs-fixed-outcome-fix

import type { Outcome } from '@/common/outcomes/outcomes'

/**
 * What an accepted guess was — the two things a `wordle.guesses` row can
 * record. The words are `submit_guess`'s own `result`.
 *
 * The two SOFT REJECTS are deliberately absent. A duplicate and a word off the
 * list burn no guess and write no row, so they never reach the log — they are
 * reported by the pill and by the board's reject ring, and BOTH read the
 * envelope's `outcome` directly, which is already one decision.
 */
export type Answer = 'correct' | 'incorrect'

/**
 * The outcome of every answer, in one place.
 *
 * **The log bar and a teammate's line read THIS**, and `submit_guess`'s
 * envelope says the same word for the same guess.
 *
 * The reading, which is this game's rather than the vocabulary's: a guess that
 * did not solve the board is NOT a bad move. You are meant to spend guesses —
 * the colors it comes back with are the whole mechanism, and a five-letter word
 * that rules out four letters has done its job. So a non-solving guess is
 * `neutral`: a turn that counted and that nothing adjudicates. (The server said
 * `lost` until 2026-09-17 and no surface believed it; the log had said
 * `neutral` all along.)
 */
export const ANSWER_OUTCOME: Record<Answer, Outcome> = {
  correct: 'won',
  incorrect: 'neutral',
}
