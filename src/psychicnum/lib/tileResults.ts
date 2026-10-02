// cs-unmet

import type { GTileResults, GTileWord } from '../types'

/**
 * The board with the secrets the Reveal is showing added as hits. A revealed
 * secret joins as a HIT rather than getting a mark of its own: green means
 * "this word is a secret", and the reveal is what makes me know it.
 * Found-versus-peeked stays answerable — the toggle un-reveals, and in coop a
 * found secret carries its guesser's dot while a revealed one has none. A
 * secret already decided keeps its entry.
 */
export function addRevealedSecrets(
  tileResults: GTileResults,
  secrets: readonly GTileWord[],
): GTileResults {
  const withRevealed = new Map(tileResults)
  for (const secret of secrets) if (!withRevealed.has(secret)) withRevealed.set(secret, true)
  return withRevealed
}
