// cs-blessed-found-words

/**
 * The terminal **missed-word reveal**, for the games that keep a list of what
 * was found and can therefore say what was not.
 *
 * **Generic over the word so the entry rides through unchanged**: this adds a
 * tag and takes nothing away, so what a caller passes in comes back out with
 * `is_bonus` on it and every other field intact.
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
 * crosses the wire at game end. WHEN to reveal is the caller's business — where
 * the word list has a found/missed filter of its own that is control enough, so
 * the gate is simply `isTerminal`. This function has no opinion and will
 * happily build the set mid-game if asked.
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
