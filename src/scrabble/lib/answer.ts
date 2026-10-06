// cs-fixed-outcome-fix

import type { Outcome } from '@/common/outcomes/outcomes'
import type { GAnswer } from '../types'

/**
 * The outcome of every answer, in one place.
 *
 * **The log bar and a teammate's line read THIS**, and `_commit_word`,
 * `exchange_tiles` and `pass_turn` say the same words in their envelopes.
 *
 * The readings, which are this game's rather than the vocabulary's:
 *
 *   - a **word** is the move this game is made of, and it scores: `won`.
 *   - an **exchange** is not. Swapping tiles is buying a better rack at the
 *     cost of a turn, and whether it pays off shows up two moves later — so it
 *     is a turn that counted and that nothing adjudicates. Calling it `won`
 *     would make trading tiles read like scoring.
 *   - a **pass** is the same shape with nothing bought.
 *   - **leftovers** is the row every ending writes for a rack still holding
 *     tiles, carrying their value as a negative score. It is `neutral` too:
 *     the game ended, which is not a defeat, and the negative number in the
 *     row already says what it cost.
 *   - **went_out** is the row for the player who emptied their rack, carrying
 *     the others' leftovers as a bonus. `neutral` for the same reason: the
 *     positive number says what it earned.
 *
 * Four of five being `neutral` is the honest shape: scrabble adjudicates the
 * PLAY and lets the score carry everything else.
 */
export const ANSWER_OUTCOME: Record<GAnswer, Outcome> = {
  word: 'won',
  exchange: 'neutral',
  pass: 'neutral',
  leftovers: 'neutral',
  went_out: 'neutral',
}
