// cs-unmet

import type { WordListRow } from '@/common/word-list/WordList'
import { buildDisplayRows } from './foundWordsDisplayRows'
import { buildRevealWords } from './revealWords'

/**
 * A game's found words and its two shipped lists, as the rows `<WordList>`
 * draws — the reveal and the merge composed once.
 *
 * This is the whole of what a word-hunt game does before it can show its list,
 * and it is the same four steps in each: decide whether the game is over,
 * fold the missed words out of the two shipped lists, merge them under the
 * found ones, and alphabetize. Composing it here is what lets the SCREEN and
 * the PRINTER agree by construction — they are the same call, not two copies of
 * the same recipe, and a printed board can no longer quietly disagree with the
 * one on screen about what was missed.
 *
 * `hasBonus` is still each game's own comparison, because it is the one thing
 * they genuinely disagree about (`legal !== required`, boggle's `legal_band !==
 * band`). False reveals the required half alone.
 *
 * `isTerminal` is the reveal's whole gate for these games: at game over the
 * list shows what nobody found, and the word list's own WHO filter is the only
 * control anyone needs over it. Mid-game it is simply the found words.
 *
 * Generic over the shipped word, since spellingbee's and wordwheel's entries
 * carry `is_pangram` and boggle's do not — the same reason `buildRevealWords`
 * is.
 */
export function buildWordListRows<W extends { word: string; points: number; is_pangram?: boolean }>({
  foundWords,
  requiredWords,
  bonusWords,
  hasBonus,
  isTerminal,
}: {
  foundWords: {
    word: string
    user_id: string
    points: number
    is_bonus: boolean
    found_at: string
    is_pangram?: boolean
  }[]
  requiredWords: readonly W[]
  bonusWords: readonly W[]
  // Does this board have a real bonus list? False reveals the required half
  // alone — see `buildRevealWords`.
  hasBonus: boolean
  // Is the game over for everyone? The reveal's only gate.
  isTerminal: boolean
}): WordListRow[] {
  const reveal = isTerminal
    ? buildRevealWords(requiredWords, hasBonus ? bonusWords : [], foundWords)
    : null
  return buildDisplayRows(foundWords, reveal)
}
