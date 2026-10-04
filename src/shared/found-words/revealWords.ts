// cs-blessed-found-words

import type { FoundWordsWord } from './foundWords'

/**
 * The terminal **missed-word reveal**, for the games that keep a list of what
 * was found and can therefore say what was not.
 *
 * Every legal word ships to the client at game start (the FE validates and
 * scores guesses against them locally), so this is a pure client-side fold —
 * nothing new crosses the wire at game end. WHEN to reveal is the caller's
 * business — where the word list has a found/missed filter of its own that is
 * control enough, so the gate is simply the game's end. This function has no
 * opinion and will happily build the set mid-game if asked.
 *
 * `revealBonus` false keeps the missed bonus words out: a board whose legal
 * band equals its required band has for bonus words only what the cleanliness
 * filter removed, and the game never suggests those
 * (`gd.puzzle.sameBandsAndHaveNoBonus`).
 */
export function buildRevealWords(
  words: readonly FoundWordsWord[],
  foundWords: readonly { word: string }[],
  revealBonus: boolean,
): FoundWordsWord[] {
  const found = new Set(foundWords.map((w) => w.word))
  return words.filter((w) => !found.has(w.word) && (revealBonus || !w.bonus))
}
