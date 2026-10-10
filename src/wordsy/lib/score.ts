// cs-unmet

import type { GTile } from '../types'

/**
 * What `word` scores against a round's table — the sum the player would do on
 * paper, shown live under the typed word. `wordsy._score_word` is the
 * server's, and decides; a test pins the two to the same examples.
 *
 * For each distinct letter in the word, as many of that letter's cards as the
 * word has of it, the highest-valued first, each worth its slot's value plus
 * its bonus. So two Bs against one B card score one B, and one C against two
 * C cards scores the better C. A letter with no card scores nothing, and ''
 * scores 0.
 */
export function scoreWord(word: string, tiles: readonly GTile[]): number {
  let score = 0
  for (const [letter, nInWord] of countLetters(word)) {
    const worths = tiles
      .filter((t) => t.letter === letter)
      .map((t) => t.value + t.bonus)
      .sort((a, b) => b - a)
    for (const worth of worths.slice(0, nInWord)) score += worth
  }
  return score
}

/** Each distinct letter of `word`, with how many times it appears. */
function countLetters(word: string): Map<string, number> {
  const counts = new Map<string, number>()
  for (const letter of word) counts.set(letter, (counts.get(letter) ?? 0) + 1)
  return counts
}
