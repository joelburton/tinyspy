// cs-unmet

/**
 * A word on one of the board's tiles (lowercase), as the game deals it: a
 * guess, a secret, the pick. Not every `word` in psychicnum is one — a hint
 * row's `word` is its clue text.
 */
export type TileWord = string

/**
 * What each decided tile says: its board word → whether that word is one of
 * the secrets. A guessed word is in the map with its verdict (true a find,
 * false a miss); a secret the Reveal shows joins it as true; an undecided
 * tile is absent. The live board and a replayed past turn both draw from one.
 */
export type TileResults = ReadonlyMap<TileWord, boolean>

/**
 * The board with the secrets the Reveal is showing added as hits. A revealed
 * secret joins as a HIT rather than getting a mark of its own: green means
 * "this word is a secret", and the reveal is what makes me know it.
 * Found-versus-peeked stays answerable — the toggle un-reveals, and in coop a
 * found secret carries its guesser's dot while a revealed one has none. A
 * secret already decided keeps its entry.
 */
export function addRevealedSecrets(
  tileResults: TileResults,
  secrets: readonly TileWord[],
): TileResults {
  const withRevealed = new Map(tileResults)
  for (const secret of secrets) if (!withRevealed.has(secret)) withRevealed.set(secret, true)
  return withRevealed
}
