// cs-fixed-outcome-fix

import type { Outcome } from '@/common/outcomes/outcomes'

/**
 * What a turn was — the four things a `psychicnum.events` row can record, plus
 * the one refusal that never becomes a row.
 *
 * The words are the server's own: `hit` / `miss` are `submit_guess`'s `verdict`,
 * and `hint` / `spoiler` are the row's `kind` column. `not_on_board` is the
 * frontend's — the board is face-up, so a word that is not on it is refused here
 * rather than round-tripped, and nothing is written down.
 */
export type Answer = 'hit' | 'miss' | 'hint' | 'spoiler' | 'not_on_board'

/**
 * The outcome of every answer, in one place.
 *
 * **The log bar, a teammate's line and the refusal pill all read THIS**, and
 * `submit_guess` / `request_spoiler` / `request_hint` say the same words in their
 * envelopes (the pill for a guess reads it from there). They are views of one
 * turn, and deriving the outcome per view is exactly how they drift: a miss is
 * one event, and the server, the pill and the log each choosing its color are
 * three chances to disagree about it.
 *
 * The readings, which are this game's rather than the vocabulary's:
 *
 *   - the budget is what you spend to play, so a miss spends some of it for
 *     nothing: red, not news.
 *   - a hint is a nudge you asked for, free here but still neither good nor
 *     bad play: `warning`, as a hint is in every game. A spoiler hands over the
 *     secret itself, which ends the hunt for it — that is a loss, and it wears
 *     red.
 *   - a word that is not on the board costs the entry, not the budget. It is
 *     still the move going wrong, so it reads like one.
 */
export const ANSWER_OUTCOME: Record<Answer, Outcome> = {
  hit: 'won',
  miss: 'lost',
  hint: 'warning',
  spoiler: 'lost',
  not_on_board: 'lost',
}

/**
 * The answer a logged guess carries, from its facts.
 *
 * `kind` is read FIRST, and this is the trap it exists for: a hint and a spoiler
 * are both written with `is_correct = true`, so asking about the verdict before
 * asking what the row is would read a hint or a spoiler as a correct guess.
 */
export function answerOf(row: {
  kind: 'guess' | 'hint' | 'spoiler'
  is_correct: boolean
}): Answer {
  if (row.kind !== 'guess') return row.kind
  return row.is_correct ? 'hit' : 'miss'
}
