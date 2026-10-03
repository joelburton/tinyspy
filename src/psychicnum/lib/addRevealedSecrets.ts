// cs-unmet

import { getGuessOutcome } from './answer'
import type { GTile } from '../types'

/**
 * The board with the secrets the Reveal is showing turned green. A revealed
 * secret becomes a HIT rather than getting a mark of its own: green means
 * "this word is a secret", and the reveal is what makes me know it.
 * Found-versus-peeked stays answerable — the toggle un-reveals, and in coop a
 * found secret carries its guesser's dot while a revealed one has none
 * (`decidedBy` stays null). A secret already decided keeps its tile as it is.
 */
export function addRevealedSecrets(
  tiles: readonly GTile[],
  secrets: readonly string[],
): GTile[] {
  return tiles.map((t) =>
    t.correct === null && secrets.includes(t.word)
      ? { ...t, correct: true, outcome: getGuessOutcome(t.word, true) }
      : t,
  )
}
