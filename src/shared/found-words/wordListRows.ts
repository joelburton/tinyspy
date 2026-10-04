// cs-blessed-found-words

import type { WordListRow } from '@/common/word-list/WordList'
import type { FoundWordRow, FoundWordsWord } from './foundWords'
import { buildDisplayRows } from './foundWordsDisplayRows'
import { buildRevealWords } from './revealWords'

/**
 * A game's finds and its board's words, as the rows `<WordList>` draws — the
 * reveal and the merge composed once.
 *
 * This is the whole of what a found-words game does before it can show its list,
 * and it is the same four steps in each: gate on whether the game is over,
 * fold the missed words out of the board's words, merge them under the found
 * ones, and alphabetize. Composing it here is what lets the SCREEN and the
 * PRINTER agree by construction — they are the same call, not two copies of
 * the same recipe, and a printed board can no longer quietly disagree with the
 * one on screen about what was missed.
 *
 * `isEnded` is the reveal's whole gate for these games: at game over the list
 * shows what nobody found, and the word list's own WHO filter is the only
 * control anyone needs over it. Mid-game it is simply the found words.
 */
export function buildWordListRows({
  foundWords,
  words,
  sameBandsAndHaveNoBonus,
  isEnded,
}: {
  foundWords: readonly FoundWordRow[]
  // Every legal word of the board (`gd.puzzle.words`).
  words: readonly FoundWordsWord[]
  // The bonus words are only what the cleanliness filter removed, so they are
  // never revealed (`gd.puzzle.sameBandsAndHaveNoBonus`).
  sameBandsAndHaveNoBonus: boolean
  // Is the game over for everyone? The reveal's only gate.
  isEnded: boolean
}): WordListRow[] {
  const reveal = isEnded ? buildRevealWords(words, foundWords, !sameBandsAndHaveNoBonus) : null
  return buildDisplayRows(foundWords, reveal)
}
