// cs-fixed-outcome-fix

import type { Outcome } from '@/common/outcomes/outcomes'
import type { WordSubmitAnswer } from '@/shared/found-words/useFoundWordSubmit'

/**
 * The outcome of every answer, in one place — the pill takes it through the
 * engine, the refused word's hexes take it on the board.
 *
 * Three refusals arrive as `not_legal` here and three sentences in the pill
 * (`explainReject`: a letter off the hive, the center letter missing, or simply
 * not a word). They are one outcome because they are one thing to the player:
 * that word did not count.
 */
export const ANSWER_OUTCOME: Record<WordSubmitAnswer, Outcome> = {
  accepted: 'won',
  // Already found is nothing happening — you have it, and now you know.
  already_found: 'warning',
  // A word the list does not know is a WRONG MOVE in this game: the seven
  // letters are in front of you and the list is the ordinary English one.
  // (wordiply reads the same event as a `warning`, deliberately — it is asking
  // you to try strange words. Each game says its own; the engine has no view.)
  not_legal: 'lost',
  // Too short is the one rule the entry enforces, and it is a small slip rather
  // than a wrong move — you simply have not finished typing.
  too_short: 'warning',
}
