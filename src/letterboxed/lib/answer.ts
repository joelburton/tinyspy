// cs-fixed-outcome-fix

import type { Outcome } from '@/common/outcomes/outcomes'

/**
 * What a turn was — the five things a `letterboxed.events` row can record, and
 * the row's own `kind` column is already the key, so nothing translates.
 *
 * The frontend's own refusal is deliberately absent. `rejectReason` turns a word
 * away before the RPC is called, nothing is written down, and the pill is its
 * only outcome surface (the board mark beside it is a shake, which carries no
 * word).
 */
export type Answer = 'word' | 'undo' | 'clear' | 'hint' | 'spoiler'

/**
 * The outcome of every answer, in one place.
 *
 * **The log bar, a teammate's line and the hint/spoiler pill all read THIS**,
 * and every RPC that writes one of these rows says the same word in its
 * envelope. They are views of one turn, and deriving the outcome per view is
 * exactly how they drift: a hint is one event, and the log and the pill
 * choosing its color separately are two chances to disagree about it.
 *
 * The readings, which are this game's rather than the vocabulary's:
 *
 *   - **a played word is `won`.** Getting a legal word onto this board is the
 *     achievement here: it has to be a real word, fit the twelve letters, cross
 *     a side at every step AND start on the letter the last word left you.
 *     Unlike a wordle guess — one of six tries, usually wrong — landing one is
 *     unambiguously progress.
 *   - **undo and clear are `noted`, not `neutral`.** They are information: the
 *     chain is shorter than it was, and the player who did it is telling the
 *     table so. Blue is the vocabulary's word for news that is not a verdict.
 *     Not `neutral`: in turn-by-turn coop an undo does cost the undoer their
 *     turn, which is why neither is red, but that is not a reason to call news
 *     nothing.
 *   - a hint names a word's length and opening letters, which leaves you
 *     something to find: `warning`, as a hint is in every game.
 *   - a spoiler IS the word. There is nothing left to find, so it is red.
 */
export const ANSWER_OUTCOME: Record<Answer, Outcome> = {
  word: 'won',
  undo: 'noted',
  clear: 'noted',
  hint: 'warning',
  spoiler: 'lost',
}
