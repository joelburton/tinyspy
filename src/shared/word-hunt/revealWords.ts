// cs-blessed-game-lib

/**
 * The terminal **missed-word reveal**, shared by the three word-hunt games
 * (spellingbee, wordwheel, boggle).
 *
 * **Generic over the word, because that is the only thing the three disagree
 * about**: spellingbee and wordwheel entries carry `is_pangram` and boggle's do
 * not. Everything else here — which words were missed, and which shipped list
 * each came from — is the same question in all three.
 */

/** A missed word, tagged with which shipped list it came from. The games hold
 *  their two lists separately, so nothing on the entry itself knows — the tag is
 *  applied here, as the lists are concatenated. */
export type RevealWord<W> = W & { is_bonus: boolean }

/**
 * The full missed set: every required word and every bonus word nobody found.
 *
 * **Both** lists ship to the client at game start (the FE validates and scores
 * guesses against them locally), so this is a pure client-side fold — nothing new
 * crosses the wire at game end. WHEN to reveal is the caller's business — for
 * the three games that use this it's simply `isTerminal`, since their word
 * list's found/missed filter is the only control anyone needs over it. This
 * function has no opinion and will happily build the set mid-game if asked.
 *
 * Pass `[]` for `bonusWords` to reveal only the required half — boggle does that
 * when its legal band equals its required band, where "bonus" degenerates to
 * "words the clean filter removed" rather than a genuinely wider dictionary.
 */
export function buildRevealWords<W extends { word: string }>(
  requiredWords: readonly W[],
  bonusWords: readonly W[],
  foundWords: readonly { word: string }[],
): RevealWord<W>[] {
  const found = new Set(foundWords.map((w) => w.word))
  return [
    ...requiredWords.filter((w) => !found.has(w.word)).map((w) => ({ ...w, is_bonus: false })),
    ...bonusWords.filter((w) => !found.has(w.word)).map((w) => ({ ...w, is_bonus: true })),
  ]
}
