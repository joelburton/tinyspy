// cs-fixed-outcome-fix

import type { Outcome } from '@/common/outcomes/outcomes'
import type { WordSubmitAnswer } from '@/shared/found-words/useFoundWordSubmit'

/**
 * The outcome of every answer, in one place.
 *
 * The same readings as its siblings', because it is the same event: the letters
 * are in front of you and the list is the ordinary English one, so a word that
 * does not count is a wrong move. What is wordwheel's own is that its wheel is a
 * MULTISET — a letter may appear twice — so "you cannot spell that from these"
 * arrives as `not_legal` like any other refusal and reads like one.
 */
export const ANSWER_OUTCOME: Record<WordSubmitAnswer, Outcome> = {
  accepted: 'won',
  // Already found is nothing happening — you have it, and now you know.
  already_found: 'warning',
  // A word the wheel cannot spell, or one the dictionary does not know, is a
  // WRONG MOVE here. (wordiply reads the same event as a `warning`,
  // deliberately — it is asking you to try strange words. Each game says its
  // own; the engine has no view.)
  not_legal: 'lost',
  // Too short is the one rule the entry enforces, and it is a small slip rather
  // than a wrong move — you simply have not finished typing.
  too_short: 'warning',
}
