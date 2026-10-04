// cs-unmet

import type { WordListRow } from '@/common/word-list/WordList'
import { buildWordListRows } from '@/shared/found-words/wordListRows'
import type { GGameData } from '../types'

/**
 * The rows the word list draws, and the printer prints: the finds I can see,
 * with every missed word folded in once the game has ended, bonus words
 * included. One call for both readers, so the paper cannot disagree with the
 * screen. boggle has no pangram, so every word says so to the shared builder.
 */
export function makeWordRows(gd: GGameData): WordListRow[] {
  return buildWordListRows({
    foundWords: gd.foundWords.map((w) => ({ ...w, pangram: false })),
    words: gd.puzzle.words.map((w) => ({ ...w, pangram: false })),
    isEnded: gd.ended,
  })
}
