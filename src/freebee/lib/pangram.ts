import { letterMask, popcount26 } from './letterMask'

/**
 * A word is a **pangram** if it uses all 7 distinct letters of
 * a FreeBee puzzle. Detection is letter-set based: exactly 7
 * distinct letters used, no further check needed (the puzzle's
 * letter set is always exactly 7 distinct letters by construction).
 *
 * Used for the +10 bonus visualization in the found-words list
 * and for the typed-word preview when the user is about to
 * submit a pangram. (Authority on whether a submission IS a
 * scoring pangram is the server — this helper is purely a UI
 * cue.)
 *
 * Examples (all evaluated against the 7-letter set):
 *   isPangram('canoed')     → false   (6 distinct letters)
 *   isPangram('abscond')    → true    (7 distinct letters)
 *   isPangram('balaclava')  → false   (only 5 distinct letters)
 */
export function isPangram(word: string): boolean {
  return popcount26(letterMask(word)) === 7
}
