// cs-fixed-outcome-fix

import type { Outcome } from '@/common/outcomes/outcomes'

/**
 * What a turn was — the two things a `setgame.events` row can record, plus the
 * one refusal that never becomes a row.
 *
 * `claim` and `hint` are the row's own `kind` column, so a row is already a key
 * here and needs no translating. `not_a_set` is the frontend's: the whole board
 * is face-up, so three cards that are not a set are refused here rather than
 * round-tripped to be told the same thing, and nothing is written down.
 */
export type Answer = 'claim' | 'hint' | 'not_a_set'

/**
 * The outcome of every answer, in one place.
 *
 * **The log bar, a teammate's line and the refusal pill all read THIS**, and
 * `submit_set`'s envelope says `won` for the same claim. They are views of one
 * turn, and deriving the outcome per view is how they drift — which they did: a
 * hint was gold in the log while every other game's hint was amber.
 *
 * The readings, which are this game's rather than the vocabulary's:
 *
 *   - a hint is spent whether or not you then go on to see the set, which is
 *     neither good nor bad play: `warning`, as a hint is in every game.
 *   - three cards that are not a set cost you the pick, not the game. It is
 *     still the move going wrong, so it wears red.
 *
 * A claim that lands has no pill — the cards leaving the board are the answer —
 * so `won` is read by the log, by a teammate's line, and by nothing else.
 */
export const ANSWER_OUTCOME: Record<Answer, Outcome> = {
  claim: 'won',
  hint: 'warning',
  not_a_set: 'lost',
}
