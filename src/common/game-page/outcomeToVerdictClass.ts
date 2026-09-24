// cs-unmet

import type { Outcome } from '../outcomes/outcomes'
import shared from './playArea.module.css'

/**
 * The class a piece wears to show an outcome — one per word, and TOTAL over the
 * vocabulary.
 *
 * Each class carries only tokens — `--verdict-fill`, `--verdict-ink`,
 * `--verdict-edge` and `--verdict-line` — so the piece wearing it need not be a
 * `.tileFace`: stackdown's entry slot and wordiply's guess row read them
 * themselves. On a tile, pair it with `.verdictFill`, which maps the first three
 * onto the face.
 *
 * Total is the point. A call site that spells out the three outcomes its game
 * produces today hands everything else to whichever branch it ends on — which
 * is how an outcome the SERVER chose gets painted red by a frontend that did
 * not recognize it. Here, a new member of `Outcome` fails to compile until it
 * has been given a look, which is the conversation you want to be having.
 */
export const OUTCOME_TO_VERDICT_CLASS: Record<Outcome, string> = {
  won: shared.verdictWon,
  lost: shared.verdictLost,
  near: shared.verdictNear,
  warning: shared.verdictWarning,
  neutral: shared.verdictNeutral,
  noted: shared.verdictNoted,
  error: shared.verdictError,
}
