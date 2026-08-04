/**
 * The terminal **missed-word reveal**, shared by the three word-hunt games
 * (spellingbee, wordwheel, boggle).
 *
 * Lives in its own module rather than beside `buildDisplayRows` because that one
 * comes in two deliberately different flavours — the shared spellingbee/wordwheel
 * copy and boggle's own — while this step is genuinely identical for all three.
 * (Each game's word shape differs slightly: spellingbee/wordwheel entries carry
 * `is_pangram`, boggle's don't. Hence the generic.)
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
 * crosses the wire at game end. The gate on *whether* to reveal is the caller's
 * `solution_revealed` check; this function has no opinion and will happily build
 * the set mid-game if asked.
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
