// cs-unmet

import type { Outcome } from '../outcomes/outcomes'
import shared from './playArea.module.css'

/**
 * The class a piece wears to show an outcome — one per word, and TOTAL over the
 * vocabulary.
 *
 * Each class carries nothing but `--verdict-fill` and `--verdict-ink`, so the
 * piece wearing it need not be a `.tileFace`: stackdown's entry slot and
 * wordiply's guess row read those two properties themselves.
 *
 * Total is the point. A call site that spells out the three outcomes its game
 * produces today hands everything else to whichever branch it ends on — which
 * is how an outcome the SERVER chose gets painted red by a frontend that did
 * not recognize it. Here, a new member of `Outcome` fails to compile until it
 * has been given a look, which is the conversation you want to be having.
 */
export const VERDICT_TONE: Record<Outcome, string> = {
  won: shared.verdictWon,
  lost: shared.verdictLost,
  near: shared.verdictNear,
  warning: shared.verdictWarning,
  neutral: shared.verdictNeutral,
  noted: shared.verdictNoted,
  error: shared.verdictError,
}
