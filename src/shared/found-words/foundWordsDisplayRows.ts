// cs-blessed-found-words

import type { WordListRow } from '@/common/word-list/WordList'
import type { FoundWordRow, FoundWordsWord } from './foundWords'

/**
 * The rows behind the info column's found-words list, for any game in the family.
 */

/**
 * One alphabetized row per word — the found ones, plus (once the game is over)
 * the ones nobody found.
 *
 * **Each word appears at most once**, which takes two different dedup rules:
 *
 *  1. **Found vs found.** In compete, the game's end opens every player's
 *     finds, so a word several people found arrives several times. It
 *     shows once, attributed to the **first finder** (earliest `at`) —
 *     that is whose color it renders in — but every finder is kept in
 *     `finderIds`, so filtering the list to a later finder still matches the
 *     word they genuinely found. In coop both are no-ops: `submit_word` rejects
 *     a word anyone already has, so there is only ever one finder.
 *  2. **Found vs unfound.** A found word shadows its reveal entry, so no word
 *     is ever shown as both found-in-color and missed-in-gray.
 *
 * `revealWords` is the caller's whole missed set — required and bonus both,
 * each word carrying its `bonus` flag, which this carries through so the list
 * can filter on it. Pass `null` or `undefined` mid-game, when nothing is
 * revealed yet.
 *
 * Pure and synchronous, so it tests away from the component.
 */
export function buildDisplayRows(
  foundWords: readonly FoundWordRow[],
  revealWords: readonly FoundWordsWord[] | null | undefined,
): WordListRow[] {
  // One entry per word: the row that wins the attribution, and every finder in
  // first-found order (the WHO filter's input). Walked earliest-first, so the
  // first row of a word opens its entry and later ones only add finders.
  // `at` is an ISO timestamp, so a lexicographic compare is chronological.
  const byWord = new Map<string, { first: FoundWordRow; finderIds: string[] }>()
  for (const r of [...foundWords].sort((a, b) => a.at.localeCompare(b.at))) {
    const seen = byWord.get(r.word)
    if (!seen) byWord.set(r.word, { first: r, finderIds: [r.by.id] })
    else if (!seen.finderIds.includes(r.by.id)) seen.finderIds.push(r.by.id)
  }

  const rows: WordListRow[] = []
  for (const { first, finderIds } of byWord.values()) {
    rows.push({
      kind: 'found',
      word: first.word,
      userId: first.by.id,
      finderIds,
      isBonus: first.bonus,
      isPangram: first.pangram,
      points: first.points,
    })
  }
  if (revealWords) {
    for (const sw of revealWords) {
      if (byWord.has(sw.word)) continue // shadowed by a found row
      rows.push({ kind: 'unfound', word: sw.word, isBonus: sw.bonus, isPangram: sw.pangram, points: sw.points })
    }
  }

  rows.sort((a, b) => a.word.localeCompare(b.word))
  return rows
}
