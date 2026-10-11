// cs-unmet

import type { GScoredLetter, GScoredWord, GTile } from '../types'

/**
 * Each letter of `word` with the card it scores on, or null — the rule, letter
 * by letter, so the page can draw which letters scored and on what.
 * `wordsy._score_word` is the server's, and decides; a test pins the two to
 * the same examples.
 *
 * For each distinct letter, as many of that letter's faceup cards as the word
 * has of it, the highest-valued first, taken by its occurrences in order. So
 * two Bs against one B card score the first B and not the second, and one C
 * against two C cards scores the better C. A letter with no card scores
 * nothing.
 */
export function scoreLetters(word: string, tiles: readonly GTile[]): GScoredLetter[] {
  // Each letter's cards, the best first; an occurrence takes the next one.
  const cardsByLetter = new Map<string, GTile[]>()
  for (const tile of tiles) {
    cardsByLetter.set(tile.letter, [...(cardsByLetter.get(tile.letter) ?? []), tile])
  }
  for (const cards of cardsByLetter.values()) cards.sort((a, b) => worth(b) - worth(a))

  const nTaken = new Map<string, number>()
  return [...word].map((letter) => {
    const n = nTaken.get(letter) ?? 0
    nTaken.set(letter, n + 1)
    return { letter, tile: cardsByLetter.get(letter)?.[n] ?? null }
  })
}

/** The worth of every card the letters score on, added up. */
export function sumScore(letters: readonly GScoredLetter[]): number {
  return letters.reduce((sum, l) => sum + (l.tile === null ? 0 : worth(l.tile)), 0)
}

/** `word` against a round's table, letter by letter and summed, worked out
 *  once: the shape the lines under the entry draw. */
export function makeScoredWord(word: string, tiles: readonly GTile[]): GScoredWord {
  const letters = scoreLetters(word, tiles)
  return { letters, score: sumScore(letters) }
}

/** What `word` scores against a round's table. */
export function scoreWord(word: string, tiles: readonly GTile[]): number {
  return sumScore(scoreLetters(word, tiles))
}

/** A card's worth: its column's value plus its bonus. */
function worth(tile: GTile): number {
  return tile.value + tile.bonus
}
