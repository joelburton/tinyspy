import { letterMask, popcount26 } from './letterMask'

/**
 * A word is a **pangram** if it uses all 9 distinct letters of a wordwheel
 * puzzle. Detection is letter-set based: exactly 9 distinct letters used, no
 * further check needed (the puzzle's letter set is always exactly 9 distinct
 * letters by construction, and every accepted word is an isogram — each tile
 * used once — so a 9-distinct-letter word necessarily uses all nine once).
 *
 * Used for the +15 bonus visualization in the found-words list and for the
 * typed-word preview when the user is about to submit a pangram. (Authority on
 * whether a submission IS a pangram that scores is the server / the shipped
 * board entry — this helper is purely a UI cue.)
 *
 * Examples (all evaluated against the 9-letter set):
 *   isPangram('canoed')      → false   (6 distinct letters)
 *   isPangram('duckling')    → false   (8 distinct letters)
 *   isPangram('chalkdust')   → true    (9 distinct letters, each once)
 */
export function isPangram(word: string): boolean {
  return popcount26(letterMask(word)) === 9
}
