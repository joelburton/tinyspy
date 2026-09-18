// cs-fixed-outcome-fix

import type { Outcome } from '@/common/outcomes/outcomes'

/**
 * What a guess was — the three values `connections.events.result` stores, and
 * the only place in the frontend that names them.
 *
 * Unusually for this roster, the FRONTEND decides which one a guess is: the
 * board is publicly readable, so `evaluateGuess` adjudicates locally and sends
 * the verdict up (the FE-knows decision, in the migration header). The column
 * and this type are the same three facts.
 */
export type Answer = 'correct' | 'oneAway' | 'wrong'

/**
 * The outcome of every answer, in one place.
 *
 * **Everything reading a ROW reads THIS** — the log bar, a teammate's line and
 * the PDF — and `submit_guess` says the same word back in its envelope, which
 * is where the pill and the tile verdict take theirs (`res.outcome`). The
 * history viewer's tint is the exception, and deliberately: it is keyed by the
 * `Answer` itself, because three tint classes cannot be keyed by a
 * seven-value vocabulary.
 *
 * `near` is the vocabulary's own word for the middle one — "close, one away,
 * nearly right", which `docs/outcomes.md` defines with this very case in mind.
 * That is why the three wire words exist at all and are not simply outcomes:
 * `oneAway` is what the BOARD did, `near` is what it is worth, and the column
 * stores the first.
 */
export const ANSWER_OUTCOME: Record<Answer, Outcome> = {
  correct: 'won',
  oneAway: 'near',
  wrong: 'lost',
}
