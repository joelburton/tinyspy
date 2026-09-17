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
export type Answer = 'played' | 'undone' | 'cleared' | 'hint' | 'spoiler'

/**
 * The outcome of every answer, in one place.
 *
 * **The log bar, a teammate's line and the hint/spoiler pill all read THIS**,
 * and every RPC that writes one of these rows says the same word in its
 * envelope. They are views of one turn, and deriving the outcome per view is
 * exactly how they drift — which they did: a hint was gold in the log and blue
 * in the pill, and taking a word back was gray on the server and blue to a
 * teammate.
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
 *     `neutral` had been the word, on the reading that in turn-by-turn coop an
 *     undo costs the undoer their turn; that is still true and is why neither
 *     is red, but it is not a reason to call news nothing.
 *   - a hint names a word's length and opening letters, which leaves you
 *     something to find: `warning`, as a hint is in every game.
 *   - a spoiler IS the word. There is nothing left to find, so it is red.
 */
export const ANSWER_OUTCOME: Record<Answer, Outcome> = {
  played: 'won',
  undone: 'noted',
  cleared: 'noted',
  hint: 'warning',
  spoiler: 'lost',
}
