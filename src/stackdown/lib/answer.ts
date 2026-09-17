// cs-fixed-outcome-fix

import type { Outcome } from '@/common/outcomes/outcomes'

/**
 * What a turn was — the four things a `stackdown.submissions` row can record.
 *
 * The words are the server's own, in both the places it says them: `accepted` /
 * `invalid` are `submit_word`'s `result`, and `hint` / `reveal` are the row's
 * `kind` column. Reusing them means the row, the envelope and this table never
 * need a translation step between them.
 */
export type Answer = 'accepted' | 'invalid' | 'hint' | 'reveal'

/**
 * The outcome of every answer, in one place.
 *
 * **The log bar, the board tiles, the entry slots and a teammate's line all read
 * THIS**, and the RPC's envelope says the same word for the same event (the pill
 * reads it from there). They are views of one turn, and deriving the outcome per
 * view is exactly how they drift: a spoiler is one event, and the pill, the log
 * and the server each choosing its color are three chances to disagree about
 * what it was.
 *
 * The readings, which are this game's rather than the vocabulary's:
 *
 *   - the board only ever exposes the six solution words, so a refused word is
 *     not a near miss or a dictionary quarrel — it is the wrong word, and it
 *     costs the turn.
 *   - a hint is a nudge you asked for and paid for, which is neither good nor
 *     bad play: `warning`, as a hint is in every game. A spoiler hands over the
 *     word itself, which ends the hunt for it — that is a loss, and it wears
 *     red.
 */
export const ANSWER_OUTCOME: Record<Answer, Outcome> = {
  accepted: 'won',
  invalid: 'lost',
  hint: 'warning',
  reveal: 'lost',
}

/**
 * The answer a logged submission carries, from its facts.
 *
 * `kind` is read FIRST because a request row leaves `valid` null — asking about
 * the verdict before asking what the row is would read a hint as a refused word.
 */
export function answerOf(row: { kind: 'word' | 'hint' | 'reveal'; valid: boolean | null }): Answer {
  if (row.kind !== 'word') return row.kind
  return row.valid ? 'accepted' : 'invalid'
}
