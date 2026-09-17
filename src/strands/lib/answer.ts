// cs-fixed-outcome-fix

import type { Outcome } from '@/common/outcomes/outcomes'
import type { GuessResult } from '../hooks/useGame'

/**
 * What a turn was — the six verdicts a guess can carry, plus the one thing that
 * is not a guess at all.
 *
 * `spent_hint` has no `result` column: a hint row is `kind: 'hint'` with
 * `result: null`, so a row's answer is its result where it has one and this
 * where it does not.
 */
export type Answer = GuessResult | 'spent_hint'

/**
 * The outcome of every answer, in one place.
 *
 * **The log bar and the pill both read THIS**, and `submit_path` / `spend_hint`
 * say the same words in their envelopes. (No teammate's line: strands narrates
 * nobody's move — see `hooks/useGame.ts`.)
 *
 * Two other tables key off the same `result` column and are NOT duplicates of
 * this one: the PDF's `MARK` is a glyph vocabulary for black and white paper,
 * and history's `BODY` is sentence text. Neither is an outcome.
 *
 * The readings, which are this game's rather than the vocabulary's:
 *
 *   - a **theme word** or the **spangram** is the goal: `won`.
 *   - a **valid non-theme word** is real progress — it moves the hint bar —
 *     but it is not the goal. `near` is exactly that: on the right track.
 *   - **already found** and **too short** are not misfires you get punished
 *     for; they are moves the rules turn away without anything happening.
 *     `warning`. Not `lost` on the reading that they "earned nothing": that
 *     describes the hint economy rather than the move.
 *   - **not a word** is the one real miss, and it is red.
 *   - a **spent hint** is `warning` for the same reason a hint is everywhere:
 *     you asked for it and paid for it, and it is neither good nor bad play.
 *     Not `neutral`: a hint does spend progress you banked, which is the
 *     opposite of earning it, but that is not a reason to say nothing happened.
 */
export const ANSWER_OUTCOME: Record<Answer, Outcome> = {
  spangram: 'won',
  theme: 'won',
  hint_word: 'near',
  duplicate: 'warning',
  too_short: 'warning',
  invalid: 'lost',
  spent_hint: 'warning',
}
