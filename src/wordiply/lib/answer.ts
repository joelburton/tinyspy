// cs-fixed-outcome-fix

import type { Outcome } from '@/common/outcomes/outcomes'

/** What happened to a submitted word — the SERVER's vocabulary, which its
 *  rejected rows carry in `reason` and which the frontend classifies its own
 *  refusals into so the two can be read through one table. */
export type Answer =
  | 'accepted'
  | 'already_found'
  | 'not_a_word'
  | 'too_short'
  | 'missing_base'

/**
 * The outcome of every answer, in one place.
 *
 * **The pill, the guess row and the turn log all read THIS.** They are three
 * views of one event, and deriving the outcome three times is exactly how they
 * drift: a word the dictionary refuses is one answer, and three surfaces each
 * choosing its color are three chances to give it three.
 *
 * The readings, which are this game's rather than the vocabulary's:
 *
 *   - a word the list does not know is a MISS, not a bad move — you are hunting
 *     for the longest word you can think of, and the list may be at fault or it
 *     may have been a typo. So is a word you already used: nothing happened.
 *   - too short, and a word without the stem in it, are RULES. Breaking one
 *     costs a turn like any other move, so it reads like a move that lost.
 */
export const ANSWER_OUTCOME: Record<Answer, Outcome> = {
  accepted: 'won',
  already_found: 'warning',
  not_a_word: 'warning',
  too_short: 'lost',
  missing_base: 'lost',
} satisfies Record<Answer, Outcome>
