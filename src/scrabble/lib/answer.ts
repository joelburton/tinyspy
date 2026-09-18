// cs-fixed-outcome-fix

import type { Outcome } from '@/common/outcomes/outcomes'
import type { PlayRow } from '../hooks/useGame'

/**
 * What a turn was — the four things a `scrabble.events` row can record, and the
 * row's own `kind` column is already the key.
 *
 * The DICTIONARY REFUSAL is deliberately absent, and it is the one absence worth
 * explaining: `_commit_word` answers `invalid` with `lost` and writes NO row, so
 * a refused word never reaches the log or the board history. The pill and the
 * red tile flash are its only surfaces, and both read that envelope.
 */
export type Answer = PlayRow['kind']

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
 *   - **leftovers** is the row `end_game` writes when a coop table stops with
 *     tiles still in hand, carrying their value as a negative score. It is
 *     `neutral` too: the table decided to stop, which is not a defeat, and the
 *     negative number in the row already says what it cost.
 *
 * Three of four being `neutral` is the honest shape: scrabble adjudicates the
 * PLAY and lets the score carry everything else.
 */
export const ANSWER_OUTCOME: Record<Answer, Outcome> = {
  word: 'won',
  exchange: 'neutral',
  pass: 'neutral',
  leftovers: 'neutral',
}
