// cs-unmet

import type { Outcome } from '@/common/outcomes/outcomes'

/** What happened to a submitted word — the shared engine's four answers, which
 *  boggle reads through one table so the pill and the tiles cannot disagree. */
export type Answer = 'accepted' | 'already_found' | 'not_legal' | 'too_short'

/**
 * The outcome of every answer, in one place — the pill takes it through the
 * engine, the refused word's tiles take it on the board.
 *
 * A word the board cannot spell and a word the dictionary does not know are one
 * answer here (`not_legal`) and two sentences in the pill, which is the split
 * boggle keeps: `explainReject` says which, and only the traceable one has tiles
 * to mark at all.
 */
export const ANSWER_OUTCOME: Record<Answer, Outcome> = {
  accepted: 'won',
  // Already found is nothing happening — you have it, and now you know.
  already_found: 'warning',
  // A word the board cannot spell, or one the dictionary does not know, is a
  // WRONG MOVE here: boggle's board is in front of you and the list is the
  // ordinary English one. (wordiply reads the same event as a `warning`,
  // deliberately — it is asking you to try strange words. Each game says its
  // own; the engine has no view.)
  not_legal: 'lost',
  // Too short is the one rule the entry enforces, and it is a small slip
  // rather than a wrong move — you simply have not finished typing.
  too_short: 'warning',
}
